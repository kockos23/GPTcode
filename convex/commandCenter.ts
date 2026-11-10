import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action } from "./_generated/server"

function classify(command: string) {
  const normalized = command.toLocaleLowerCase("sk")
  if (/draft|odpoved|reply/.test(normalized)) {
    return { intent: "DRAFT_EMAIL_REPLY", targetApp: "Gmail", approval: "Pred odoslaním", agent: "COS" }
  }
  if (/udalost|kalend|event|stretnut/.test(normalized)) {
    return { intent: "CREATE_CALENDAR_EVENT", targetApp: "Google Calendar", approval: "Pred vykonaním", agent: "COS" }
  }
  if (/príloh|priloh|ulož|uloz.*drive/.test(normalized)) {
    return { intent: "SAVE_ATTACHMENT_TO_DRIVE", targetApp: "Google Drive", approval: "Pred vykonaním", agent: "COS" }
  }
  if (/úloh|uloh|pripomien/.test(normalized)) {
    return { intent: "CREATE_TASK", targetApp: "Control Center", approval: "Nie", agent: "COS" }
  }
  return { intent: "GENERAL_COMMAND", targetApp: "Chief of Staff", approval: "Podľa akcie", agent: "COS" }
}

export const decideAgentTask = action({
  args: {
    taskId: v.string(),
    decision: v.union(v.literal("approve"), v.literal("postpone")),
  },
  returns: v.object({
    ok: v.boolean(), code: v.string(), message: v.string(), status: v.string(),
  }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) {
      return { ok: false, code: "FORBIDDEN", message: "Nemáš oprávnenie schvaľovať úlohy.", status: "" }
    }
    const taskId = args.taskId.trim()
    if (!taskId || taskId.length > 100) {
      return { ok: false, code: "INVALID_ID", message: "Neplatné ID úlohy.", status: "" }
    }
    try {
      const result = await ctx.runMutation(internal.chiefOfStaff.decideWorkQueueTask, { taskId, decision: args.decision })
      if (!result.ok) return {
        ok: false, code: result.code,
        message: result.code === "CONFLICT" ? "Úloha už nečaká na schválenie. Obnov prehľad." : "Úloha sa v registri nenašla.",
        status: result.status,
      }
      return {
        ok: true, code: "OK",
        message: args.decision === "approve" ? "Zadanie schválené a pripravené na prevzatie." : "Zadanie odložené.",
        status: result.status,
      }
    } catch {
      return { ok: false, code: "SOURCE_ERROR", message: "Register nie je dostupný. Skús obnoviť prehľad.", status: "" }
    }
  },
})

export const submitCommand = action({
  args: {
    command: v.string(),
    contextType: v.optional(v.string()),
    contextId: v.optional(v.string()),
    channel: v.optional(v.string()),
    agentId: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(), status: v.string(), intent: v.string(), targetApp: v.string(),
  }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) throw new Error("Nemáš oprávnenie zadávať príkazy.")

    const command = args.command.trim()
    if (!command) throw new Error("Napíš príkaz, ktorý má Chief of Staff spracovať.")
    if (command.length > 5_000) throw new Error("Príkaz je príliš dlhý. Skráť ho pod 5 000 znakov.")

    const classified = classify(command)
    const assignedAgent = args.agentId?.trim() || classified.agent
    const saved = await ctx.runMutation(internal.chiefOfStaff.createCommand, {
      command, contextType: args.contextType ?? "General", contextId: args.contextId ?? "",
      channel: args.channel ?? "Dashboard", intent: classified.intent,
      targetApp: classified.targetApp, approval: classified.approval, agent: assignedAgent,
      createdBy: access.email ?? "Tomáš",
    })
    return { id: saved.id, status: saved.status, intent: classified.intent, targetApp: classified.targetApp }
  },
})

export const createTask = action({
  args: {
    title: v.string(),
    details: v.optional(v.string()),
    projectId: v.optional(v.string()),
    priority: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  returns: v.object({ id: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) throw new Error("Nemáš oprávnenie vytvárať úlohy.")

    const title = args.title.trim()
    if (!title) throw new Error("Názov úlohy nemôže byť prázdny.")
    if (title.length > 300 || (args.details?.length ?? 0) > 5_000) {
      throw new Error("Úloha je príliš dlhá. Skráť názov alebo detaily.")
    }

    return await ctx.runMutation(internal.chiefOfStaff.createTask, {
      title, details: args.details ?? "", projectId: args.projectId ?? "",
      priority: args.priority ?? "DÔLEŽITÉ", deadline: args.deadline, source: "Dashboard",
    })
  },
})
