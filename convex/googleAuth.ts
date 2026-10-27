import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
} from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server"
import { callMacalyJson } from "./macaly"

// Keep this set aligned with the non-Google providers registered in auth.ts.
// The generated app always starts with ResendOTP; add "password" only while
// Password is registered there.
const enabledFallbackProviderIds = new Set(["resend-otp"])

function accountCanRestoreAccess(account: {
  provider: string
  secret?: string
  emailVerified?: string
}) {
  // The shipped fallback methods persist one of these credential markers only
  // after the account can restore access. Placeholder or unrelated rows do not
  // make unlinking safe.
  if (!enabledFallbackProviderIds.has(account.provider)) return false
  return Boolean(account.secret?.length || account.emailVerified?.length)
}

export const createAuthorizationUrl = action({
  args: {
    appOrigin: v.string(),
    handoffChallenge: v.string(),
    popupChallenge: v.optional(v.string()),
    flowMode: v.union(v.literal("redirect"), v.literal("popup")),
  },
  handler: async (_ctx, args) => {
    const result = await callMacalyJson("/api/client-app/google-auth/start", {
      appOrigin: args.appOrigin,
      returnPath: "/auth/google/callback",
      handoffChallenge: args.handoffChallenge,
      ...(args.popupChallenge ? { popupChallenge: args.popupChallenge } : {}),
      flowMode: args.flowMode,
    })
    if (
      typeof result.authorizationUrl !== "string" ||
      typeof result.flowId !== "string"
    ) {
      throw new Error("The platform did not return a Google authorization URL")
    }
    return {
      authorizationUrl: result.authorizationUrl,
      flowId: result.flowId,
    }
  },
})

export const completeAuthorizationPopup = action({
  args: {
    flowId: v.string(),
    grant: v.string(),
    popupVerifier: v.string(),
  },
  handler: async (_ctx, args) => {
    const result = await callMacalyJson(
      "/api/client-app/google-auth/complete",
      args,
    )
    if (result.completed !== true) {
      throw new Error("The platform did not complete the Google popup")
    }
    return { completed: true }
  },
})

export const getAuthorizationStatus = action({
  args: { flowId: v.string() },
  handler: async (_ctx, args) => {
    const result = await callMacalyJson("/api/client-app/google-auth/status", {
      flowId: args.flowId,
    })
    if (result.status === "pending") return { status: "pending" as const }
    if (result.status === "complete" && typeof result.grant === "string") {
      return { status: "complete" as const, grant: result.grant }
    }
    if (result.status === "error" && typeof result.error === "string") {
      return { status: "error" as const, error: result.error }
    }
    throw new Error("The platform returned an invalid Google authorization status")
  },
})

export const recentUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [userId, sessionId] = await Promise.all([
      getAuthUserId(ctx),
      getAuthSessionId(ctx),
    ])
    if (!userId || !sessionId) return null
    const session = await ctx.db.get(sessionId)
    if (
      !session ||
      session.userId !== userId ||
      Date.now() - session._creationTime > 10 * 60 * 1000
    ) {
      return null
    }
    return userId
  },
})

export const resolveGoogleUser = internalMutation({
  args: {
    providerAccountId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    linkToUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("google_subject", (q) =>
        q.eq("googleSubject", args.providerAccountId),
      )
      .unique()

    if (args.linkToUserId) {
      const target = await ctx.db.get(args.linkToUserId)
      if (!target) {
        throw new ConvexError({ code: "GOOGLE_LINK_TARGET_MISSING" })
      }
      if (existing && existing._id !== target._id) {
        throw new ConvexError({
          code: "GOOGLE_ACCOUNT_LINKED_TO_ANOTHER_USER",
        })
      }
      if (
        target.googleSubject &&
        target.googleSubject !== args.providerAccountId
      ) {
        throw new ConvexError({
          code: "USER_HAS_DIFFERENT_GOOGLE_ACCOUNT",
        })
      }
      // Keep the canonical OTP/password profile unchanged. Linking is only an
      // ownership assertion; it must never overwrite an existing email.
      if (!target.googleSubject) {
        await ctx.db.patch(target._id, {
          googleSubject: args.providerAccountId,
        })
      }
      return target._id
    }

    // The first Google sign-in owns the initial profile. Once a row exists,
    // keep its canonical fields unchanged: the identity may have been linked
    // explicitly from an OTP/password account.
    if (existing) return existing._id

    return await ctx.db.insert("users", {
      googleSubject: args.providerAccountId,
      email: args.email,
      emailVerificationTime: Date.now(),
      ...(args.name ? { name: args.name } : {}),
      ...(args.image ? { image: args.image } : {}),
    })
  },
})

export const unlinkGoogle = action({
  args: {},
  handler: async (ctx): Promise<{ unlinked: boolean }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Sign in before unlinking Google")
    const preparation = await ctx.runQuery(
      internal.googleAuth.prepareGoogleUnlink,
      { userId },
    )
    if (!preparation.shouldUnlink) return { unlinked: false }

    // Revoke first: if revocation fails, Google remains linked and retryable.
    // The internal mutation does not depend on the now-revoked session.
    await invalidateSessions(ctx, { userId })
    return await ctx.runMutation(internal.googleAuth.unlinkGoogleAccount, {
      userId,
    })
  },
})

export const prepareGoogleUnlink = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.googleSubject) return { shouldUnlink: false }

    const fallbackAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect()
    if (!fallbackAccounts.some(accountCanRestoreAccess)) {
      throw new ConvexError({ code: "LAST_SIGN_IN_METHOD" })
    }
    return { shouldUnlink: true }
  },
})

export const unlinkGoogleAccount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.googleSubject) return { unlinked: false }

    const fallbackAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect()
    if (!fallbackAccounts.some(accountCanRestoreAccess)) {
      throw new ConvexError({ code: "LAST_SIGN_IN_METHOD" })
    }
    await ctx.db.patch(args.userId, { googleSubject: undefined })
    return { unlinked: true }
  },
})

export const accountSecurity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    const fallbackAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect()
    return {
      googleLinked: Boolean(user.googleSubject),
      canUnlinkGoogle: fallbackAccounts.some(accountCanRestoreAccess),
    }
  },
})

export const revokeOtherSessions = action({
  args: {},
  handler: async (ctx) => {
    const [userId, sessionId] = await Promise.all([
      getAuthUserId(ctx),
      getAuthSessionId(ctx),
    ])
    if (!userId || !sessionId) throw new Error("Sign in to manage sessions")
    await invalidateSessions(ctx, { userId, except: [sessionId] })
    return { revoked: true }
  },
})

export const revokeAllSessions = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Sign in to manage sessions")
    await invalidateSessions(ctx, { userId })
    return { revoked: true }
  },
})
