import { v } from "convex/values"
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server"

const MAX_COLLECTION = 500
const ALLOWED_EXTERNAL_ACCOUNTS = new Set([
  "tomas.kocner@wofevents.com",
  "tomas.kocner@wofexpo.com",
])

function bounded(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_COLLECTION)
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
      workQueue: bounded(args.workQueue), tasks: bounded(args.tasks), commands: bounded(args.commands),
      sourceErrors: args.sourceErrors.slice(0, 20).map(error => error.slice(0, 500)),
      syncedAt: args.syncedAt, updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, snapshot)
    else await ctx.db.insert("chiefOfStaffSnapshots", snapshot)
    return { ok: true, updatedAt: now }
  },
})

export async function readTaskList(ctx: QueryCtx, snapshotTasks: unknown) {
  const nativeTasks = await ctx.db.query("chiefOfStaffTasks").withIndex("by_status").collect()
  const taskIds = new Set(nativeTasks.map(item => item.taskId))
  const sheetTasks = Array.isArray(snapshotTasks)
    ? (snapshotTasks as Array<Record<string, unknown>>).filter(item => !taskIds.has(String(item.id ?? ""))) : []
  return [...nativeTasks.map(item => ({
    id: item.taskId, created: new Date(item.createdAt).toISOString(), source: item.source,
    title: item.title, details: item.details, projectId: item.projectId, owner: item.owner,
    priority: item.priority, status: item.status, deadline: item.deadline ?? "", reminder: "",
    recurrence: "NIE", related: "", result: item.result,
    updated: new Date(item.updatedAt).toISOString(),
  })), ...sheetTasks].slice(0, MAX_COLLECTION)
}

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
    const [tasks, nativeCommands, externalEmails, emailTriage] = await Promise.all([
      readTaskList(ctx, row.tasks),
      ctx.db.query("chiefOfStaffCommands").withIndex("by_created_at").order("desc").take(MAX_COLLECTION),
      ctx.db.query("chiefOfStaffExternalEmails").withIndex("by_received_at").order("desc").take(100),
      ctx.db.query("chiefOfStaffEmailTriage").collect(),
    ])
    const commandIds = new Set(nativeCommands.map(item => item.commandId))
    const sheetCommands = Array.isArray(row.commands)
      ? (row.commands as Array<Record<string, unknown>>).filter(item => !commandIds.has(String(item.id ?? ""))) : []
    const commands = [...nativeCommands.map(item => ({
      id: item.commandId, received: new Date(item.createdAt).toISOString(), channel: item.channel,
      contextType: item.contextType, contextId: item.contextId, command: item.command,
      intent: item.intent, targetApp: item.targetApp, approval: item.approval, status: item.status,
      agent: item.agent, result: item.result, error: item.error, runId: item.commandId,
      updated: new Date(item.updatedAt).toISOString(),
    })), ...sheetCommands].slice(0, MAX_COLLECTION)
    const snapshotEmails = Array.isArray(row.emails) ? row.emails as Array<Record<string, unknown>> : []
    const uniqueExternalEmails = [...new Map(externalEmails.map(item => [item.emailKey, item])).values()]
    const externalIds = new Set(uniqueExternalEmails.map(item => item.emailKey))
    const triageById=new Map(emailTriage.map(item=>[item.emailId,item]))
    const mergedEmails:Array<Record<string,unknown>> = [
      ...uniqueExternalEmails.map(item => ({
        id: item.emailKey, threadId: item.threadId, subject: item.subject, sender: item.sender,
        timestamp: item.timestamp, preview: item.preview, bodyText: item.bodyText, bodyHtml: item.bodyHtml,
        sourceAccount: item.sourceAccount, url: item.url, important: item.important,
      })),
      ...snapshotEmails.filter(item => !externalIds.has(String(item.id ?? ""))),
    ]
    const emails = mergedEmails.filter(item=>String(item.sourceAccount??"").trim().toLowerCase()!=="tomas.kocner@wofexpo.com")
      .map(item=>{const triage=triageById.get(String(item.id??""));return{...item,triageState:triage?.state??"INBOX",triageFolder:triage?.folder??""}})
      .sort((left, right) => Date.parse(String(right["timestamp"] ?? "")) - Date.parse(String(left["timestamp"] ?? "")))
      .slice(0, 100)
    return {
      calendar: row.calendar, emails, agents: row.agents, workQueue: row.workQueue,
      tasks, commands, sourceErrors: row.sourceErrors,
      syncedAt: row.syncedAt, updatedAt: row.updatedAt,
    }
  },
})

export const upsertExternalEmail = internalMutation({
  args: {
    sourceAccount: v.string(), messageId: v.string(), providerUid: v.optional(v.string()), threadId: v.string(), subject: v.string(),
    sender: v.string(), timestamp: v.string(), preview: v.string(), bodyText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()), url: v.string(), important: v.boolean(),
  },
  returns: v.object({ ok: v.boolean(), created: v.boolean(), emailKey: v.string() }),
  handler: async (ctx, args) => {
    const sourceAccount = args.sourceAccount.trim().toLowerCase()
    if (!ALLOWED_EXTERNAL_ACCOUNTS.has(sourceAccount)) throw new Error("Unsupported source account")
    const messageId = args.messageId.trim().slice(0, 500)
    if (!messageId) throw new Error("Missing message ID")
    const timestampMs = Date.parse(args.timestamp)
    if (!Number.isFinite(timestampMs)) throw new Error("Invalid timestamp")
    const emailKey = `imap:${sourceAccount}:${messageId}`
    const now = Date.now()
    const record = {
      emailKey, sourceAccount, messageId, providerUid: args.providerUid?.trim().slice(0, 120) || undefined, threadId: args.threadId.trim().slice(0, 500),
      subject: args.subject.trim().slice(0, 500), sender: args.sender.trim().slice(0, 500),
      timestamp: new Date(timestampMs).toISOString(), preview: args.preview.trim().slice(0, 2000),
      bodyText: args.bodyText?.trim().slice(0, 50000), bodyHtml: args.bodyHtml?.trim().slice(0, 250000),
      url: args.url.trim().slice(0, 1000), important: args.important,
      receivedAt: timestampMs, updatedAt: now,
    }
    const existing = await ctx.db.query("chiefOfStaffExternalEmails")
      .withIndex("by_email_key", query => query.eq("emailKey", emailKey)).collect()
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, record)
      for (const duplicate of existing.slice(1)) await ctx.db.delete(duplicate._id)
      return { ok: true, created: false, emailKey }
    }
    await ctx.db.insert("chiefOfStaffExternalEmails", { ...record, createdAt: now })
    const retained = await ctx.db.query("chiefOfStaffExternalEmails")
      .withIndex("by_received_at").order("desc").take(201)
    for (const stale of retained.slice(200)) await ctx.db.delete(stale._id)
    return { ok: true, created: true, emailKey }
  },
})

export const getExternalEmailForWorker = internalQuery({
  args: { emailKey: v.string() },
  returns: v.union(v.null(), v.object({
    emailKey: v.string(), sourceAccount: v.string(), messageId: v.string(), providerUid: v.optional(v.string()), threadId: v.string(),
    subject: v.string(), sender: v.string(), timestamp: v.string(), preview: v.string(),
    bodyText: v.optional(v.string()), bodyHtml: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const emailKey = args.emailKey.trim().slice(0, 600)
    if (!emailKey) return null
    const row = await ctx.db.query("chiefOfStaffExternalEmails").withIndex("by_email_key", query => query.eq("emailKey", emailKey)).unique()
    if (!row) return null
    return { emailKey: row.emailKey, sourceAccount: row.sourceAccount, messageId: row.messageId, providerUid: row.providerUid, threadId: row.threadId, subject: row.subject, sender: row.sender, timestamp: row.timestamp, preview: row.preview, bodyText: row.bodyText, bodyHtml: row.bodyHtml }
  },
})

export const health = internalQuery({
  args: {},
  returns: v.object({
    ok: v.boolean(), code: v.string(), ageMs: v.union(v.null(), v.number()),
    syncedAt: v.union(v.null(), v.number()), sourceErrors: v.array(v.string()),
    counts: v.object({
      calendar: v.number(), emails: v.number(), agents: v.number(), workQueue: v.number(),
      tasks: v.number(), commands: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const row = await ctx.db.query("chiefOfStaffSnapshots")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "primary")).unique()
    const emptyCounts = { calendar: 0, emails: 0, agents: 0, workQueue: 0, tasks: 0, commands: 0 }
    if (!row) return {
      ok: false, code: "SNAPSHOT_MISSING", ageMs: null, syncedAt: null, sourceErrors: [], counts: emptyCounts,
    }
    const ageMs = Math.max(0, Date.now() - row.syncedAt)
    const stale = ageMs > 26 * 60 * 60 * 1000
    const count = (value: unknown) => Array.isArray(value) ? value.length : 0
    return {
      ok: !stale, code: stale ? "SNAPSHOT_STALE" : "OK", ageMs, syncedAt: row.syncedAt,
      sourceErrors: row.sourceErrors,
      counts: {
        calendar: count(row.calendar), emails: count(row.emails), agents: count(row.agents),
        workQueue: count(row.workQueue), tasks: count(row.tasks), commands: count(row.commands),
      },
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

export const createTaskFromN8n = internalMutation({
  args: {
    taskId: v.string(), title: v.string(), details: v.string(), projectId: v.string(), priority: v.string(),
    deadline: v.optional(v.string()), source: v.string(), assignee: v.string(), approval: v.string(),
  },
  returns: v.object({ ok: v.boolean(), duplicate: v.boolean(), id: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const taskId = args.taskId.trim().slice(0, 120)
    if (!taskId) throw new Error("INVALID_TASK_ID")
    const existing = await ctx.db.query("chiefOfStaffTasks").withIndex("by_task_id", query => query.eq("taskId", taskId)).unique()
    if (existing) return { ok: true, duplicate: true, id: taskId, status: existing.status }
    const now = Date.now()
    const status = args.approval === "OWNER" ? "ČAKÁ NA SCHVÁLENIE" : "NOVÉ"
    await ctx.db.insert("chiefOfStaffTasks", {
      taskId, projectId: args.projectId.trim().slice(0, 120), title: args.title.trim().slice(0, 300),
      details: args.details.trim().slice(0, 5000), owner: "Tomáš", assignee: args.assignee.trim().slice(0, 80) || "NORA",
      priority: args.priority.trim().slice(0, 20) || "P2", status, deadline: args.deadline?.trim().slice(0, 10) || undefined,
      expectedOutput: "Dokončená úloha alebo explicitný blokér", result: "", approval: args.approval,
      source: args.source.trim().slice(0, 80) || "Telegram", createdAt: now, updatedAt: now,
    })
    return { ok: true, duplicate: false, id: taskId, status }
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
      targetApp: args.targetApp, approval: args.approval, status: "NEW", attempt: 0,
      agent: args.agent, result: "", error: "", createdBy: args.createdBy,
      createdAt: now, updatedAt: now,
    })
    return { id, status: "NEW" }
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
    if (oldStatus !== "ČAKÁ NA SCHVÁLENIE") return { ok: false, code: "CONFLICT", status: oldStatus }
    const status = args.decision === "approve" ? "READY" : "PLÁNOVANÉ"
    const updated = [...queue]
    updated[index] = { ...updated[index], status, updated: new Date().toISOString() }
    await ctx.db.patch(snapshot._id, { workQueue: updated, updatedAt: Date.now() })
    return { ok: true, code: "OK", status }
  },
})
