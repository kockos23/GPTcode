import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"

const MAX_BATCH = 50
const LEASE_MS = 15 * 60 * 1000

export const submit = internalMutation({
  args: {
    handoffId: v.string(), threadId: v.string(), fromAgent: v.string(), toAgents: v.array(v.string()),
    kind: v.string(), title: v.string(), summary: v.string(), context: v.string(),
    requestedAction: v.string(), priority: v.string(), artifactUrls: v.array(v.string()),
    correlationId: v.string(),
  },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), handoffId: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("agentHandoffs")
      .withIndex("by_handoff_id", query => query.eq("handoffId", args.handoffId)).unique()
    if (existing) return { ok: true, duplicate: true, handoffId: existing.handoffId }
    const now = Date.now()
    await ctx.db.insert("agentHandoffs", {
      ...args, status: "NEW", createdAt: now, updatedAt: now,
    })
    return { ok: true, duplicate: false, handoffId: args.handoffId }
  },
})

export const list = internalQuery({
  args: { agent: v.optional(v.string()), threadId: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(args.limit ?? 25)))
    const rows = args.threadId
      ? await ctx.db.query("agentHandoffs").withIndex("by_thread_id", query => query.eq("threadId", args.threadId!)).order("desc").take(limit)
      : await ctx.db.query("agentHandoffs").withIndex("by_created_at").order("desc").take(MAX_BATCH)
    return rows.filter(row => !args.agent || row.toAgents.includes(args.agent) || row.toAgents.includes("ALL")).slice(0, limit)
  },
})

export const claim = internalMutation({
  args: { agent: v.string(), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const now = Date.now()
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? 5)))
    const candidates = [
      ...await ctx.db.query("agentHandoffs").withIndex("by_status_created_at", query => query.eq("status", "NEW")).take(MAX_BATCH),
      ...await ctx.db.query("agentHandoffs").withIndex("by_status_created_at", query => query.eq("status", "CLAIMED")).take(MAX_BATCH),
    ].filter(row =>
      (row.toAgents.includes(args.agent) || row.toAgents.includes("ALL")) &&
      (row.status === "NEW" || (row.leaseUntil ?? 0) < now),
    ).sort((left, right) => left.createdAt - right.createdAt).slice(0, limit)
    const claimed: Array<Record<string, unknown>> = []
    for (const row of candidates) {
      await ctx.db.patch(row._id, { status: "CLAIMED", claimedBy: args.agent, leaseUntil: now + LEASE_MS, updatedAt: now })
      claimed.push({ ...row, status: "CLAIMED", claimedBy: args.agent, leaseUntil: now + LEASE_MS, updatedAt: now })
    }
    return claimed
  },
})

export const complete = internalMutation({
  args: {
    handoffId: v.string(), agent: v.string(), ok: v.boolean(), result: v.optional(v.string()),
    error: v.optional(v.string()), artifactUrls: v.optional(v.array(v.string())),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("agentHandoffs")
      .withIndex("by_handoff_id", query => query.eq("handoffId", args.handoffId)).unique()
    if (!row) return { ok: false, code: "NOT_FOUND", status: "" }
    if (row.status === "DONE") return { ok: true, code: "ALREADY_DONE", status: "DONE" }
    if (row.status !== "CLAIMED" || row.claimedBy !== args.agent || (row.leaseUntil ?? 0) < Date.now()) {
      return { ok: false, code: "STALE_CLAIM", status: row.status }
    }
    const status = args.ok ? "DONE" : "BLOCKED"
    await ctx.db.patch(row._id, {
      status, result: args.result, error: args.error,
      artifactUrls: args.artifactUrls ? [...new Set([...row.artifactUrls, ...args.artifactUrls])].slice(0, 20) : row.artifactUrls,
      leaseUntil: undefined, updatedAt: Date.now(),
    })
    return { ok: true, code: "OK", status }
  },
})
