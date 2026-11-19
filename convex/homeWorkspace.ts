import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"

async function requireOwner(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  if (user?.email?.trim().toLowerCase() !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

const clean = (value: string, limit: number) => value.trim().slice(0, limit)
const slug = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))

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

export const saveAsset = mutation({
  args: { domain: v.union(v.literal("HOME"), v.literal("VEHICLE")), kind: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const name = clean(args.name, 200)
    const kind = clean(args.kind, 60).toUpperCase()
    if (!name || !kind) throw new Error("INVALID_ASSET")
    const assetId = `manual:${args.domain.toLowerCase()}:${slug(name)}`
    const existing = await ctx.db.query("personalAssets").withIndex("by_asset_id", q => q.eq("assetId", assetId)).unique()
    const now = Date.now()
    const row = { assetId, domain: args.domain, kind, name, status: "ACTIVE", metadata: {}, updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalAssets", { ...row, createdAt: now })
    return { ok: true, assetId }
  },
})

export const saveMaintenance = mutation({
  args: { assetId: v.string(), category: v.string(), title: v.string(), nextDueDate: v.string(), recurrence: v.string(), notes: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const asset = await ctx.db.query("personalAssets").withIndex("by_asset_id", q => q.eq("assetId", args.assetId)).unique()
    if (!asset || asset.status !== "ACTIVE" || !validDate(args.nextDueDate)) throw new Error("INVALID_MAINTENANCE")
    const title = clean(args.title, 240)
    if (!title) throw new Error("INVALID_MAINTENANCE")
    const maintenanceId = `manual:${args.assetId}:${slug(title)}`.slice(0, 120)
    const existing = await ctx.db.query("personalMaintenance").withIndex("by_maintenance_id", q => q.eq("maintenanceId", maintenanceId)).unique()
    const now = Date.now()
    const row = { maintenanceId, assetId: args.assetId, category: clean(args.category, 60).toUpperCase() || "OTHER", title, recurrence: clean(args.recurrence, 60) || "NONE", nextDueAt: Date.parse(`${args.nextDueDate}T12:00:00Z`), leadDays: [30, 14, 7, 1], status: "ACTIVE", notes: clean(args.notes, 1000), updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalMaintenance", { ...row, createdAt: now })
    return { ok: true, maintenanceId }
  },
})

export const saveReading = mutation({
  args: { assetId: v.string(), utility: v.union(v.literal("ELECTRICITY"), v.literal("WATER")), date: v.string(), value: v.number(), unit: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const asset = await ctx.db.query("personalAssets").withIndex("by_asset_id", q => q.eq("assetId", args.assetId)).unique()
    if (!asset || !validDate(args.date) || !Number.isFinite(args.value) || args.value < 0) throw new Error("INVALID_READING")
    const readingId = `manual:${args.assetId}:${args.utility}:${args.date}`.slice(0, 120)
    const existing = await ctx.db.query("personalUtilityReadings").withIndex("by_reading_id", q => q.eq("readingId", readingId)).unique()
    const row = { readingId, assetId: args.assetId, utility: args.utility, recordedAt: Date.parse(`${args.date}T12:00:00Z`), value: args.value, unit: clean(args.unit, 20), source: "HOME_WORKSPACE", note: clean(args.note, 1000), createdAt: existing?.createdAt ?? Date.now() }
    if (existing) await ctx.db.replace(existing._id, row)
    else await ctx.db.insert("personalUtilityReadings", row)
    return { ok: true, readingId }
  },
})

export const saveSubscription = mutation({
  args: { name: v.string(), provider: v.string(), amount: v.optional(v.number()), currency: v.string(), billingCycle: v.string(), nextRenewalDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const name = clean(args.name, 200)
    if (!name || (args.amount !== undefined && (!Number.isFinite(args.amount) || args.amount < 0)) || (args.nextRenewalDate && !validDate(args.nextRenewalDate))) throw new Error("INVALID_SUBSCRIPTION")
    const subscriptionId = `manual:${slug(name)}`
    const existing = await ctx.db.query("personalSubscriptions").withIndex("by_subscription_id", q => q.eq("subscriptionId", subscriptionId)).unique()
    const now = Date.now()
    const row = { subscriptionId, name, provider: clean(args.provider, 160), category: "PERSONAL", amount: args.amount, currency: clean(args.currency, 3).toUpperCase() || "EUR", billingCycle: clean(args.billingCycle, 40) || "MONTHLY", nextRenewalAt: args.nextRenewalDate ? Date.parse(`${args.nextRenewalDate}T12:00:00Z`) : undefined, status: "ACTIVE", source: "HOME_WORKSPACE", updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("personalSubscriptions", { ...row, createdAt: now })
    return { ok: true, subscriptionId }
  },
})
