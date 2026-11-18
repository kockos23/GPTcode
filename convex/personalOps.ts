import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { PERSONAL_DOMAINS, SIGNAL_SEVERITIES, planSignals, requiresOwnerApproval, type PersonalDomain, type SignalSeverity } from "./personalOpsLogic"

const MAX_SIGNALS = 100
const domain = v.union(...PERSONAL_DOMAINS.map(value => v.literal(value)))
const severity = v.union(...SIGNAL_SEVERITIES.map(value => v.literal(value)))

function bounded(value: string, max: number): string {
  return value.trim().slice(0, max)
}

export const upsertGoal = internalMutation({
  args: {
    goalId: v.string(), domain, title: v.string(), desiredOutcome: v.string(), successMetric: v.string(),
    ownerAgent: v.string(), priority: v.string(), horizon: v.string(), status: v.string(), targetDate: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), goalId: v.string() }),
  handler: async (ctx, args) => {
    const goalId = bounded(args.goalId, 120)
    const existing = await ctx.db.query("personalGoals").withIndex("by_goal_id", query => query.eq("goalId", goalId)).unique()
    const now = Date.now()
    const values = {
      ...args, goalId, title: bounded(args.title, 300), desiredOutcome: bounded(args.desiredOutcome, 2000),
      successMetric: bounded(args.successMetric, 500), ownerAgent: bounded(args.ownerAgent, 80),
      priority: bounded(args.priority, 20), horizon: bounded(args.horizon, 40), status: bounded(args.status, 40), updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, values)
    else await ctx.db.insert("personalGoals", { ...values, createdAt: now })
    return { ok: true, created: !existing, goalId }
  },
})

export const ingestSignal = internalMutation({
  args: {
    signalId: v.string(), dedupeKey: v.string(), domain, source: v.string(), kind: v.string(), title: v.string(),
    summary: v.string(), severity, occurredAt: v.number(), dueAt: v.optional(v.number()),
    relatedAssetId: v.optional(v.string()), payload: v.any(),
  },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), signalId: v.string() }),
  handler: async (ctx, args) => {
    const dedupeKey = bounded(args.dedupeKey, 300)
    const existing = await ctx.db.query("personalSignals").withIndex("by_dedupe_key", query => query.eq("dedupeKey", dedupeKey)).unique()
    if (existing) return { ok: true, duplicate: true, signalId: existing.signalId }
    const now = Date.now()
    const signalId = bounded(args.signalId, 120)
    await ctx.db.insert("personalSignals", {
      ...args, signalId, dedupeKey, source: bounded(args.source, 100), kind: bounded(args.kind, 100),
      title: bounded(args.title, 300), summary: bounded(args.summary, 2000), status: "NEW", createdAt: now, updatedAt: now,
    })
    return { ok: true, duplicate: false, signalId }
  },
})

export const listOpenSignals = internalQuery({
  args: { domain: v.optional(domain), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(MAX_SIGNALS, Math.floor(args.limit ?? 50)))
    const rows = await ctx.db.query("personalSignals")
      .withIndex("by_status_occurred_at", query => query.eq("status", "NEW"))
      .order("desc").take(MAX_SIGNALS)
    return rows.filter(row => !args.domain || row.domain === args.domain).slice(0, limit)
  },
})

export const upsertAsset = internalMutation({
  args: { assetId: v.string(), domain, kind: v.string(), name: v.string(), status: v.string(), metadata: v.any() },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), assetId: v.string() }),
  handler: async (ctx, args) => {
    const assetId = bounded(args.assetId, 120)
    const existing = await ctx.db.query("personalAssets").withIndex("by_asset_id", query => query.eq("assetId", assetId)).unique()
    const now = Date.now()
    const values = { ...args, assetId, kind: bounded(args.kind, 80), name: bounded(args.name, 300), status: bounded(args.status, 40), updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, values)
    else await ctx.db.insert("personalAssets", { ...values, createdAt: now })
    return { ok: true, created: !existing, assetId }
  },
})

export const upsertMaintenance = internalMutation({
  args: {
    maintenanceId: v.string(), assetId: v.string(), category: v.string(), title: v.string(), recurrence: v.string(),
    nextDueAt: v.number(), leadDays: v.array(v.number()), status: v.string(), lastCompletedAt: v.optional(v.number()), notes: v.string(),
  },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), maintenanceId: v.string() }),
  handler: async (ctx, args) => {
    const maintenanceId = bounded(args.maintenanceId, 120)
    const existing = await ctx.db.query("personalMaintenance").withIndex("by_maintenance_id", query => query.eq("maintenanceId", maintenanceId)).unique()
    const now = Date.now()
    const values = {
      ...args, maintenanceId, assetId: bounded(args.assetId, 120), category: bounded(args.category, 80),
      title: bounded(args.title, 300), recurrence: bounded(args.recurrence, 100),
      leadDays: [...new Set(args.leadDays.map(value => Math.max(0, Math.min(365, Math.floor(value)))))].sort((a, b) => b - a).slice(0, 12),
      status: bounded(args.status, 40), notes: bounded(args.notes, 2000), updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, values)
    else await ctx.db.insert("personalMaintenance", { ...values, createdAt: now })
    return { ok: true, created: !existing, maintenanceId }
  },
})

export const runPlanner = internalMutation({
  args: { runId: v.string(), kind: v.union(v.literal("DAILY"), v.literal("WEEKLY")), periodStart: v.number(), periodEnd: v.number() },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), runId: v.string(), proposed: v.number() }),
  handler: async (ctx, args) => {
    const runId = bounded(args.runId, 120)
    const existingRun = await ctx.db.query("personalPlannerRuns").withIndex("by_run_id", query => query.eq("runId", runId)).unique()
    if (existingRun) return { ok: true, duplicate: true, runId, proposed: existingRun.proposedStepIds.length }
    const rows = await ctx.db.query("personalSignals")
      .withIndex("by_status_occurred_at", query => query.eq("status", "NEW"))
      .order("desc").take(MAX_SIGNALS)
    const actions = planSignals(rows.map(row => ({
      signalId: row.signalId, domain: row.domain as PersonalDomain, title: row.title, summary: row.summary,
      severity: row.severity as SignalSeverity, occurredAt: row.occurredAt, dueAt: row.dueAt,
    })), Date.now(), args.kind === "DAILY" ? 12 : 30)
    const now = Date.now()
    const proposedStepIds: string[] = []
    for (const action of actions) {
      const stepId = `${runId}:${action.signalId}`.slice(0, 240)
      const approval = requiresOwnerApproval({ domain: action.domain, action: action.title }) || action.approval === "OWNER" ? "OWNER" : "NONE"
      await ctx.db.insert("personalPlanSteps", {
        stepId, planId: runId, title: action.title, assignedAgent: action.assignedAgent, priority: action.priority,
        status: "PROPOSED", approval, deadline: action.dueAt, dependencies: [], sourceSignalIds: [action.signalId],
        expectedOutput: "Dokončený krok alebo explicitný blokér", createdAt: now, updatedAt: now,
      })
      proposedStepIds.push(stepId)
      const source = rows.find(row => row.signalId === action.signalId)
      if (source) await ctx.db.patch(source._id, { status: "PLANNED", updatedAt: now })
    }
    await ctx.db.insert("personalPlannerRuns", {
      runId, kind: args.kind, status: "PROPOSED", periodStart: args.periodStart, periodEnd: args.periodEnd,
      signalIds: actions.map(action => action.signalId), proposedStepIds,
      summary: `Navrhnutých krokov: ${proposedStepIds.length}`, createdAt: now, updatedAt: now,
    })
    return { ok: true, duplicate: false, runId, proposed: proposedStepIds.length }
  },
})
