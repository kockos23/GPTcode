import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"

async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  if (user?.email?.trim().toLowerCase() !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

const score = v.optional(v.number())

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx)
    const [daily, habits, checkins, logs, supplements] = await Promise.all([
      ctx.db.query("personalHealthDaily").withIndex("by_date").order("desc").take(30),
      ctx.db.query("personalHealthHabits").withIndex("by_active", q => q.eq("active", true)).take(50),
      ctx.db.query("personalHealthCheckins").withIndex("by_date").order("desc").take(30),
      ctx.db.query("personalHealthHabitLogs").withIndex("by_date").order("desc").take(100),
      ctx.db.query("personalHealthSupplements").withIndex("by_date").order("desc").take(100),
    ])
    return { daily, habits, checkins, logs, supplements }
  },
})

export const saveCheckin = mutation({
  args: { date: v.string(), mood: score, energy: score, soreness: score, perceivedStress: score, sleepQuality: score, note: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("INVALID_DATE")
    const values = [args.mood, args.energy, args.soreness, args.perceivedStress, args.sleepQuality]
    if (values.some(value => value !== undefined && (!Number.isFinite(value) || value < 1 || value > 10))) throw new Error("INVALID_SCORE")
    const checkinId = `manual:${args.date}`
    const existing = await ctx.db.query("personalHealthCheckins").withIndex("by_checkin_id", q => q.eq("checkinId", checkinId)).unique()
    const now = Date.now()
    const row = { ...args, checkinId, source: "HEALTH_WORKSPACE", note: args.note.trim().slice(0, 2000), updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalHealthCheckins", { ...row, createdAt: now })
    return { ok: true }
  },
})

export const saveHabit = mutation({
  args: { name: v.string(), category: v.string(), target: v.number(), unit: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const name = args.name.trim().slice(0, 200)
    if (!name || !Number.isFinite(args.target) || args.target < 0) throw new Error("INVALID_HABIT")
    const now = Date.now()
    const habitId = `habit:${name.toLowerCase().replace(/[^a-z0-9áäčďéíľĺňóôŕšťúýž]+/gi, "-").slice(0, 80)}`
    const existing = await ctx.db.query("personalHealthHabits").withIndex("by_habit_id", q => q.eq("habitId", habitId)).unique()
    const row = { habitId, name, category: args.category.slice(0, 60), target: args.target, unit: args.unit.slice(0, 30), cadence: "DAILY", active: true, updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalHealthHabits", { ...row, createdAt: now })
    return { ok: true, habitId }
  },
})

export const logHabit = mutation({
  args: { habitId: v.string(), date: v.string(), value: v.number(), completed: v.boolean(), note: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    if (!Number.isFinite(args.value) || args.value < 0) throw new Error("INVALID_VALUE")
    const logId = `${args.habitId}:${args.date}`.slice(0, 120)
    const existing = await ctx.db.query("personalHealthHabitLogs").withIndex("by_log_id", q => q.eq("logId", logId)).unique()
    const now = Date.now()
    const row = { ...args, logId, source: "HEALTH_WORKSPACE", note: args.note.trim().slice(0, 1000), updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalHealthHabitLogs", { ...row, createdAt: now })
    return { ok: true }
  },
})
