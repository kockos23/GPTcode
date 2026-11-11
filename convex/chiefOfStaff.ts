import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"

const MAX_COLLECTION = 500
const WAITING_FOR_APPROVAL = "ČAKÁ NA SCHVÁLENIE"

export type WorkQueueDecision = {
  taskId: string
  status: "READY" | "PLÁNOVANÉ"
  updated: string
}

function bounded(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_COLLECTION)
}

export function applyWorkQueueDecisions(queue: unknown, decisions: readonly WorkQueueDecision[]): unknown[] {
  const rows = Array.isArray(queue) ? queue : []
  const byId = new Map(decisions.map(decision => [decision.taskId, decision]))
  return rows.map(item => {
    if (!item || typeof item !== "object") return item
    const row = item as Record<string, unknown>
    const decision = byId.get(String(row.id ?? ""))
    if (!decision || String(row.status ?? "") !== WAITING_FOR_APPROVAL) return item
    return { ...row, status: decision.status, updated: decision.updated }
  })
}

export const syncSnapshot = internalMutation({
  args: {
    calendar: v.any(), emails: v.any(), agents: v.any(), workQueue: v.any(),
    tasks: v.any(), commands: v.any(), sourceErrors: v.array(v.string()), syncedAt: v.number(),
  },
  returns: v.object({ ok: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db.query("chiefOfStaffSnapshots")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "primary"))
      .unique()
    const snapshot = {
      cacheKey: "primary",
      calendar: bounded(args.calendar), emails: bounded(args.emails), agents: bounded(args.agents),
      workQueue: applyWorkQueueDecisions(bounded(args.workQueue), existing?.workQueueDecisions ?? []),
      tasks: bounded(args.tasks), commands: bounded(args.commands),
      sourceErrors: args.sourceErrors.slice(0, 20).map(error => error.slice(0, 500)),
      syncedAt: args.syncedAt, updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, snapshot)
    else await ctx.db.insert("chiefOfStaffSnapshots", snapshot)
    return { ok: true, updatedAt: now }
  },
})

export const getSnapshot = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({
    calendar: v.any(), emails: v.any(), agents: v.any(), workQueue: v.any(),
    tasks: v.any(), commands: v.any(), sourceErrors: v.array(v.string()),
    syncedAt: v.number(), updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    const row = await ctx.db.query("chiefOfStaffSnapshots")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "primary"))
      .unique()
    if (!row) return null
    const [nativeTasks, nativeCommands] = await Promise.all([
      ctx.db.query("chiefOfStaffTasks").withIndex("by_status").collect(),
      ctx.db.query("chiefOfStaffCommands").withIndex("by_created_at").order("desc").take(MAX_COLLECTION),
    ])
    const taskIds = new Set(nativeTasks.map(item => item.taskId))
    const commandIds = new Set(nativeCommands.map(item => item.commandId))
    const sheetTasks = Array.isArray(row.tasks)
      ? (row.tasks as Array<Record<string, unknown>>).filter(item => !taskIds.has(String(item.id ?? ""))) : []
    const sheetCommands = Array.isArray(row.commands)
      ? (row.commands as Array<Record<string, unknown>>).filter(item => !commandIds.has(String(item.id ?? ""))) : []
    const tasks = [...nativeTasks.map(item => ({
      id: item.taskId, created: new Date(item.createdAt).toISOString(), source: item.source,
      title: item.title, details: item.details, projectId: item.projectId, owner: item.owner,
      priority: item.priority, status: item.status, deadline: item.deadline ?? "", reminder: "",
      recurrence: "NIE", related: "", result: item.result,
      updated: new Date(item.updatedAt).toISOString(),
    })), ...sheetTasks].slice(0, MAX_COLLECTION)
    const commands = [...nativeCommands.map(item => ({
      id: item.commandId, received: new Date(item.createdAt).toISOString(), channel: item.channel,
      contextType: item.contextType, contextId: item.contextId, command: item.command,
      intent: item.intent, targetApp: item.targetApp, approval: item.approval, status: item.status,
      agent: item.agent, result: item.result, error: item.error, runId: item.commandId,
      updated: new Date(item.updatedAt).toISOString(),
    })), ...sheetCommands].slice(0, MAX_COLLECTION)
    return {
      calendar: row.calendar, emails: row.emails, agents: row.agents,
      workQueue: applyWorkQueueDecisions(row.workQueue, row.workQueueDecisions ?? []),
      tasks, commands, sourceErrors: row.sourceErrors,
      syncedAt: row.syncedAt, updatedAt: row.updatedAt,
    }
  },
})

export const health = internalQuery({
  args: {},
  returns: v.object({
    ok: v.boolean(), code: v.string(), ageMs: v.union(v.null(), v.number()),
    syncedAt: v.union(v.null(), v.number()), sourceErrors: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const row = await ctx.db.query("chiefOfStaffSnapshots")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "primary")).unique()
    if (!row) return { ok: false, code: "SNAPSHOT_MISSING", ageMs: null, syncedAt: null, sourceErrors: [] }
    const ageMs = Math.max(0, Date.now() - row.syncedAt)
    const stale = ageMs > 26 * 60 * 60 * 1000
    return {
      ok: !stale, code: stale ? "SNAPSHOT_STALE" : "OK", ageMs, syncedAt: row.syncedAt,
      sourceErrors: row.sourceErrors,
    }
  },
})

export const createTask = internalMutation({
  args: {
    title: v.string(), details: v.string(), projectId: v.string(), priority: v.string(),
    deadline: v.optional(v.string()), source: v.string(),
  },
  returns: v.object({ id: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = `T${now}`
    await ctx.db.insert("chiefOfStaffTasks", {
      taskId: id, projectId: args.projectId, title: args.title, details: args.details,
      owner: "Tomáš", assignee: "Tomáš", priority: args.priority, status: "NOVÉ",
      deadline: args.deadline, expectedOutput: "", result: "", approval: "NIE",
      source: args.source, createdAt: now, updatedAt: now,
    })
    return { id, status: "NOVÉ" }
  },
})

export const createCommand = internalMutation({
  args: {
    command: v.string(), contextType: v.string(), contextId: v.string(), channel: v.string(),
    intent: v.string(), targetApp: v.string(), approval: v.string(), agent: v.string(),
    createdBy: v.string(),
  },
  returns: v.object({ id: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = `CMD${now}`
    await ctx.db.insert("chiefOfStaffCommands", {
      commandId: id, command: args.command, contextType: args.contextType,
      contextId: args.contextId, channel: args.channel, intent: args.intent,
      targetApp: args.targetApp, approval: args.approval, status: "NOVÉ",
      agent: args.agent, result: "", error: "", createdBy: args.createdBy,
      createdAt: now, updatedAt: now,
    })
    return { id, status: "NOVÉ" }
  },
})

export const decideWorkQueueTask = internalMutation({
  args: {
    taskId: v.string(), decision: v.union(v.literal("approve"), v.literal("postpone")),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.query("chiefOfStaffSnapshots")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "primary")).unique()
    if (!snapshot || !Array.isArray(snapshot.workQueue)) return { ok: false, code: "NOT_FOUND", status: "" }
    const queue = snapshot.workQueue as Array<Record<string, unknown>>
    const index = queue.findIndex(item => item.id === args.taskId)
    if (index < 0) return { ok: false, code: "NOT_FOUND", status: "" }
    const oldStatus = String(queue[index].status ?? "")
    if (oldStatus !== WAITING_FOR_APPROVAL) return { ok: false, code: "CONFLICT", status: oldStatus }
    const status = args.decision === "approve" ? "READY" as const : "PLÁNOVANÉ" as const
    const updatedAt = new Date().toISOString()
    const updated = [...queue]
    updated[index] = { ...updated[index], status, updated: updatedAt }
    const workQueueDecisions: WorkQueueDecision[] = [
      ...(snapshot.workQueueDecisions ?? []).flatMap(item => {
        if (item.taskId === args.taskId || (item.status !== "READY" && item.status !== "PLÁNOVANÉ")) return []
        return [{ taskId: item.taskId, status: item.status, updated: item.updated }]
      }),
      { taskId: args.taskId, status, updated: updatedAt },
    ].slice(-MAX_COLLECTION)
    await ctx.db.patch(snapshot._id, { workQueue: updated, workQueueDecisions, updatedAt: Date.now() })
    return { ok: true, code: "OK", status }
  },
})
