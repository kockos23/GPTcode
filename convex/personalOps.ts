import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { PERSONAL_DOMAINS, SIGNAL_SEVERITIES, planSignals, requiresOwnerApproval, type PersonalDomain, type SignalSeverity } from "./personalOpsLogic"
import { analyzeHealthDay, normalizeGarminDaily } from "./healthAgentLogic"
import { dueMaintenanceSignals, subscriptionRenewalSignal } from "./homeVehicleLogic"

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

export const listProposedSteps = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)))
    return await ctx.db.query("personalPlanSteps")
      .withIndex("by_status_deadline", query => query.eq("status", "PROPOSED"))
      .take(limit)
  },
})

export const decidePlanStep = internalMutation({
  args: {
    stepId: v.string(),
    decision: v.union(v.literal("APPROVE"), v.literal("POSTPONE"), v.literal("DISMISS")),
    postponeUntil: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), stepId: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const stepId = bounded(args.stepId, 240)
    const step = await ctx.db.query("personalPlanSteps").withIndex("by_step_id", query => query.eq("stepId", stepId)).unique()
    if (!step) throw new Error("STEP_NOT_FOUND")
    if (step.status !== "PROPOSED") throw new Error("STEP_ALREADY_DECIDED")
    if (args.decision === "POSTPONE" && (!args.postponeUntil || !Number.isFinite(args.postponeUntil) || args.postponeUntil <= Date.now())) {
      throw new Error("INVALID_POSTPONE_UNTIL")
    }
    const status = args.decision === "APPROVE" ? "APPROVED" : args.decision === "POSTPONE" ? "POSTPONED" : "DISMISSED"
    const note = args.note ? bounded(args.note, 1000) : undefined
    await ctx.db.patch(step._id, {
      status,
      deadline: args.decision === "POSTPONE" ? args.postponeUntil : step.deadline,
      result: note,
      updatedAt: Date.now(),
    })
    return { ok: true, stepId, status }
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

export const upsertHealthDaily = internalMutation({
  args: {
    snapshotId: v.string(), date: v.string(), source: v.literal("GARMIN_CONNECT"), quality: v.string(),
    metrics: v.object({
      steps: v.optional(v.number()), sleepMinutes: v.optional(v.number()), restingHeartRate: v.optional(v.number()),
      averageStress: v.optional(v.number()), intensityMinutes: v.optional(v.number()), activeCalories: v.optional(v.number()),
      bodyBatteryLow: v.optional(v.number()), bodyBatteryHigh: v.optional(v.number()), activities: v.optional(v.number()),
    }),
    baselineRestingHeartRate: v.optional(v.number()), baselineSleepMinutes: v.optional(v.number()), occurredAt: v.number(),
  },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), snapshotId: v.string(), signals: v.number() }),
  handler: async (ctx, args) => {
    const snapshotId = bounded(args.snapshotId, 120)
    const existing = await ctx.db.query("personalHealthDaily").withIndex("by_snapshot_id", query => query.eq("snapshotId", snapshotId)).unique()
    const metrics = normalizeGarminDaily(args.metrics)
    const now = Date.now()
    const values = { snapshotId, date: bounded(args.date, 10), source: args.source, quality: bounded(args.quality, 40), metrics, updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, values)
    else await ctx.db.insert("personalHealthDaily", { ...values, createdAt: now })
    const signals = analyzeHealthDay({
      date: args.date, metrics, occurredAt: args.occurredAt,
      baseline: { restingHeartRate: args.baselineRestingHeartRate, sleepMinutes: args.baselineSleepMinutes },
    })
    for (const signal of signals) {
      const dedupeKey = signal.signalId
      const duplicate = await ctx.db.query("personalSignals").withIndex("by_dedupe_key", query => query.eq("dedupeKey", dedupeKey)).unique()
      if (!duplicate) await ctx.db.insert("personalSignals", {
        signalId: signal.signalId, dedupeKey, domain: signal.domain, source: "GARMIN_CONNECT", kind: "HEALTH_DAILY_ALERT",
        title: signal.title, summary: signal.summary, severity: signal.severity, status: "NEW", occurredAt: signal.occurredAt,
        payload: { date: args.date }, createdAt: now, updatedAt: now,
      })
    }
    return { ok: true, created: !existing, snapshotId, signals: signals.length }
  },
})

export const recordUtilityReading = internalMutation({
  args: {
    readingId: v.string(), assetId: v.string(), utility: v.union(v.literal("ELECTRICITY"), v.literal("WATER")),
    recordedAt: v.number(), value: v.number(), unit: v.string(), source: v.string(), note: v.string(),
  },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), readingId: v.string() }),
  handler: async (ctx, args) => {
    const readingId = bounded(args.readingId, 120)
    const existing = await ctx.db.query("personalUtilityReadings").withIndex("by_reading_id", query => query.eq("readingId", readingId)).unique()
    if (existing) return { ok: true, duplicate: true, readingId }
    if (!Number.isFinite(args.value) || args.value < 0) throw new Error("INVALID_READING")
    await ctx.db.insert("personalUtilityReadings", {
      ...args, readingId, assetId: bounded(args.assetId, 120), unit: bounded(args.unit, 20),
      source: bounded(args.source, 100), note: bounded(args.note, 1000), createdAt: Date.now(),
    })
    return { ok: true, duplicate: false, readingId }
  },
})

export const upsertSubscription = internalMutation({
  args: {
    subscriptionId: v.string(), name: v.string(), provider: v.string(), category: v.string(), amount: v.optional(v.number()),
    currency: v.optional(v.string()), billingCycle: v.string(), nextRenewalAt: v.optional(v.number()),
    cancellationUrl: v.optional(v.string()), status: v.string(), source: v.string(),
  },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), subscriptionId: v.string() }),
  handler: async (ctx, args) => {
    const subscriptionId = bounded(args.subscriptionId, 120)
    const existing = await ctx.db.query("personalSubscriptions").withIndex("by_subscription_id", query => query.eq("subscriptionId", subscriptionId)).unique()
    const now = Date.now()
    const values = {
      ...args, subscriptionId, name: bounded(args.name, 300), provider: bounded(args.provider, 200), category: bounded(args.category, 80),
      currency: args.currency ? bounded(args.currency.toUpperCase(), 3) : undefined, billingCycle: bounded(args.billingCycle, 40),
      cancellationUrl: args.cancellationUrl ? bounded(args.cancellationUrl, 1000) : undefined,
      status: bounded(args.status, 40), source: bounded(args.source, 100), updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, values)
    else await ctx.db.insert("personalSubscriptions", { ...values, createdAt: now })
    return { ok: true, created: !existing, subscriptionId }
  },
})

export const runPlanner = internalMutation({
  args: { runId: v.string(), kind: v.union(v.literal("DAILY"), v.literal("WEEKLY")), periodStart: v.number(), periodEnd: v.number() },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), runId: v.string(), proposed: v.number() }),
  handler: async (ctx, args) => {
    const runId = bounded(args.runId, 120)
    const existingRun = await ctx.db.query("personalPlannerRuns").withIndex("by_run_id", query => query.eq("runId", runId)).unique()
    if (existingRun) return { ok: true, duplicate: true, runId, proposed: existingRun.proposedStepIds.length }
    const now = Date.now()
    const maintenance = await ctx.db.query("personalMaintenance")
      .withIndex("by_status_due", query => query.eq("status", "ACTIVE"))
      .take(MAX_SIGNALS)
    const assets = await ctx.db.query("personalAssets").collect()
    const assetDomain = new Map(assets.map(asset => [asset.assetId, asset.domain]))
    const proactive = dueMaintenanceSignals(maintenance.flatMap(item => {
      const itemDomain = assetDomain.get(item.assetId)
      if (itemDomain !== "HOME" && itemDomain !== "VEHICLE") return []
      return [{ maintenanceId: item.maintenanceId, domain: itemDomain, title: item.title, nextDueAt: item.nextDueAt, leadDays: item.leadDays }]
    }), now)
    const subscriptions = await ctx.db.query("personalSubscriptions")
      .withIndex("by_status_renewal", query => query.eq("status", "ACTIVE"))
      .take(MAX_SIGNALS)
    for (const subscription of subscriptions) {
      const signal = subscriptionRenewalSignal({
        subscriptionId: subscription.subscriptionId, name: subscription.name, nextRenewalAt: subscription.nextRenewalAt,
        amount: subscription.amount, currency: subscription.currency, now,
      })
      if (signal) proactive.push(signal)
    }
    for (const signal of proactive) {
      const duplicate = await ctx.db.query("personalSignals").withIndex("by_dedupe_key", query => query.eq("dedupeKey", signal.signalId)).unique()
      if (!duplicate) await ctx.db.insert("personalSignals", {
        signalId: signal.signalId, dedupeKey: signal.signalId, domain: signal.domain, source: "PERSONAL_OPS_PLANNER",
        kind: signal.signalId.startsWith("subscription:") ? "SUBSCRIPTION_RENEWAL" : "MAINTENANCE_DUE",
        title: signal.title, summary: signal.summary, severity: signal.severity, status: "NEW", occurredAt: signal.occurredAt,
        dueAt: signal.dueAt, payload: {}, createdAt: now, updatedAt: now,
      })
    }
    const rows = await ctx.db.query("personalSignals")
      .withIndex("by_status_occurred_at", query => query.eq("status", "NEW"))
      .order("desc").take(MAX_SIGNALS)
    const actions = planSignals(rows.map(row => ({
      signalId: row.signalId, domain: row.domain as PersonalDomain, title: row.title, summary: row.summary,
      severity: row.severity as SignalSeverity, occurredAt: row.occurredAt, dueAt: row.dueAt,
    })), Date.now(), args.kind === "DAILY" ? 12 : 30)
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
