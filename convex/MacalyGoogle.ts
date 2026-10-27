import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import type { ConvexCredentialsConfig } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"

import { internal } from "./_generated/api"
import { callMacalyJson } from "./macaly"

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Google identity is missing ${field}`)
  }
  return value
}

export const MacalyGoogle: ConvexCredentialsConfig = ConvexCredentials({
  id: "macaly-google",
  authorize: async (credentials, ctx) => {
    const grant = requiredString(credentials.grant, "grant")
    const handoffVerifier = requiredString(
      credentials.handoffVerifier,
      "handoffVerifier",
    )
    const linkToCurrentUser = credentials.linkToCurrentUser === true
    const identity = await callMacalyJson(
      "/api/client-app/google-auth/redeem",
      { grant, handoffVerifier },
    )
    if (identity.emailVerified !== true) {
      throw new Error("Google email is not verified")
    }

    const currentUserId = linkToCurrentUser
      ? await ctx.runQuery(internal.googleAuth.recentUserId, {})
      : null
    if (linkToCurrentUser && !currentUserId) {
      throw new ConvexError({ code: "GOOGLE_LINK_REAUTH_REQUIRED" })
    }

    const userId = await ctx.runMutation(
      internal.googleAuth.resolveGoogleUser,
      {
        providerAccountId: requiredString(
          identity.providerAccountId,
          "providerAccountId",
        ),
        email: requiredString(identity.email, "email"),
        name: typeof identity.name === "string" ? identity.name : undefined,
        image: typeof identity.image === "string" ? identity.image : undefined,
        linkToUserId: currentUserId ?? undefined,
      },
    )
    return { userId }
  },
})
