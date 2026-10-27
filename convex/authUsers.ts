import type { ConvexAuthConfig } from "@convex-dev/auth/server"

type CreateOrUpdateUser = NonNullable<
  NonNullable<ConvexAuthConfig["callbacks"]>["createOrUpdateUser"]
>

// Install as convexAuth.callbacks.createOrUpdateUser. Convex's default links
// new OTP/password accounts to verified users by email, including Google users.
// Only an existing authAccounts relationship may select an existing user here.
// Google linking remains in resolveGoogleUser, after recent-session validation.
export const createProviderUser: CreateOrUpdateUser = async (ctx, args) => {
  const { existingUserId, profile } = args
  // Convex sets this phase only after consuming a valid verification code for
  // an existing account (also used by password verification/reset). A provider
  // profile alone is not proof. Reject untrusted claims before Convex can also
  // copy them into authAccounts after this callback returns.
  const verifiedAccount = args.type === "verification" && existingUserId !== null
  if (!verifiedAccount && (profile.emailVerified || profile.phoneVerified)) {
    throw new Error("Verification claims require a completed verification flow")
  }
  if (existingUserId !== null) {
    const user = await ctx.db.get(existingUserId)
    if (!user) throw new Error("The sign-in account no longer exists")

    // Keep canonical profiles and existing account relationships (including
    // previously linked accounts). Verification may only mark matching fields.
    if (
      verifiedAccount &&
      profile.emailVerified === true &&
      typeof profile.email === "string" &&
      profile.email === user.email
    ) {
      await ctx.db.patch(existingUserId, { emailVerificationTime: Date.now() })
    }
    if (
      verifiedAccount &&
      profile.phoneVerified === true &&
      typeof profile.phone === "string" &&
      profile.phone === user.phone
    ) {
      await ctx.db.patch(existingUserId, { phoneVerificationTime: Date.now() })
    }
    return existingUserId
  }

  // Do not spread a provider profile into users: credential profiles can carry
  // client-controlled fields. Adapt trusted app defaults here when required by
  // the schema; never accept role, tenantId or googleSubject from credentials.
  return await ctx.db.insert("users", {
    ...(typeof profile.email === "string" ? { email: profile.email } : {}),
    ...(typeof profile.phone === "string" ? { phone: profile.phone } : {}),
    ...(typeof profile.name === "string" ? { name: profile.name } : {}),
    ...(typeof profile.image === "string" ? { image: profile.image } : {}),
  })
}
