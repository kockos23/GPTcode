import { getAuthUserId } from "@convex-dev/auth/server"
import { query } from "./_generated/server"

export const currentAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return { allowed: false as const, code: "UNAUTHENTICATED" as const }
    }

    const user = await ctx.db.get(userId)
    if (!user) {
      return { allowed: false as const, code: "FORBIDDEN" as const, email: null }
    }

    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
    const email = user.email?.trim().toLowerCase()

    if (!ownerEmail || !email || email !== ownerEmail) {
      return {
        allowed: false as const,
        code: "FORBIDDEN" as const,
        email: user.email ?? null,
      }
    }

    return {
      allowed: true as const,
      code: "OWNER" as const,
      name: user.name ?? "Tomáš",
      email: user.email ?? ownerEmail,
    }
  },
})
