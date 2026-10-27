import { convexAuth } from "@convex-dev/auth/server"
import { ResendOTP } from "./ResendOTP"
import { MacalyGoogle } from "./MacalyGoogle"
import { createProviderUser } from "./authUsers"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP, MacalyGoogle],
  callbacks: { createOrUpdateUser: createProviderUser },
  session: { totalDurationMs: 1000 * 60 * 60 * 24 * 30 },
})
