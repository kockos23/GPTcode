import { getAuthUserId } from "@convex-dev/auth/server"
import { query, type QueryCtx } from "./_generated/server"

async function requireOwner(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  if (user?.email?.trim().toLowerCase() !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx)
    const [assets, maintenance, readings, subscriptions] = await Promise.all([
      ctx.db.query("personalAssets").collect(),
      ctx.db.query("personalMaintenance").withIndex("by_status_due", q => q.eq("status", "ACTIVE")).take(100),
      ctx.db.query("personalUtilityReadings").collect(),
      ctx.db.query("personalSubscriptions").withIndex("by_status_renewal", q => q.eq("status", "ACTIVE")).take(100),
    ])
    readings.sort((a, b) => b.recordedAt - a.recordedAt)
    maintenance.sort((a, b) => a.nextDueAt - b.nextDueAt)
    subscriptions.sort((a, b) => (a.nextRenewalAt ?? Number.MAX_SAFE_INTEGER) - (b.nextRenewalAt ?? Number.MAX_SAFE_INTEGER))
    return { assets, maintenance, readings: readings.slice(0, 100), subscriptions }
  },
})
