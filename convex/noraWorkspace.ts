import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"

async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  const email = user?.email?.trim().toLowerCase()
  if (!email || email !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx)
    const [tasks, proposals, commands] = await Promise.all([
      ctx.db.query("chiefOfStaffTasks").collect(),
      ctx.db.query("personalPlanSteps").withIndex("by_status_deadline", query => query.eq("status", "PROPOSED")).take(30),
      ctx.db.query("chiefOfStaffCommands").withIndex("by_created_at").order("desc").take(20),
    ])
    return {
      tasks: tasks.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100).map(task => ({
        id: task.taskId, title: task.title, details: task.details, priority: task.priority, status: task.status,
        deadline: task.deadline, source: task.source, assignee: task.assignee, updatedAt: task.updatedAt,
      })),
      proposals: proposals.map(step => ({
        id: step.stepId, title: step.title, priority: step.priority, status: step.status, approval: step.approval,
        assignedAgent: step.assignedAgent, deadline: step.deadline, expectedOutput: step.expectedOutput,
      })),
      commands: commands.map(command => ({ id: command.commandId, command: command.command, intent: command.intent, status: command.status, createdAt: command.createdAt })),
    }
  },
})

export const createTask = mutation({
  args: { title: v.string(), details: v.optional(v.string()), priority: v.string(), deadline: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const title = args.title.trim().slice(0, 300)
    if (!title) throw new Error("Názov úlohy nemôže byť prázdny")
    const now = Date.now()
    const id = `NORA-${now}`
    await ctx.db.insert("chiefOfStaffTasks", {
      taskId: id, projectId: "", title, details: args.details?.trim().slice(0, 5000) || "", owner: "Tomáš",
      assignee: "NORA", priority: args.priority.slice(0, 20), status: "NOVÉ", deadline: args.deadline,
      expectedOutput: "Dokončená úloha alebo explicitný blokér", result: "", approval: "NIE",
      source: "NORA workspace", createdAt: now, updatedAt: now,
    })
    return { id, status: "NOVÉ" }
  },
})

export const completeTask = mutation({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const task = await ctx.db.query("chiefOfStaffTasks").withIndex("by_task_id", query => query.eq("taskId", args.taskId)).unique()
    if (!task) throw new Error("Úloha neexistuje")
    await ctx.db.patch(task._id, { status: "HOTOVO", updatedAt: Date.now() })
  },
})

export const proposeCalendarEvent = mutation({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const task = await ctx.db.query("chiefOfStaffTasks").withIndex("by_task_id", query => query.eq("taskId", args.taskId)).unique()
    if (!task) throw new Error("Úloha neexistuje")
    const now = Date.now()
    const commandId = `CAL-${task.taskId}-${now}`.slice(0, 120)
    await ctx.db.insert("chiefOfStaffCommands", {
      commandId, command: `Navrhni termín a vytvor po potvrdení udalosť z úlohy: ${task.title}`,
      contextType: "Task", contextId: task.taskId, channel: "NORA workspace", intent: "CREATE_CALENDAR_EVENT",
      targetApp: "Google Calendar", approval: "Pred vykonaním", status: "NOVÉ", agent: "NORA", result: "", error: "",
      createdBy: "Tomáš", createdAt: now, updatedAt: now,
    })
    return { id: commandId, status: "NOVÉ" }
  },
})

export const decideProposal = mutation({
  args: { stepId: v.string(), decision: v.union(v.literal("APPROVE"), v.literal("POSTPONE"), v.literal("DISMISS")) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const step = await ctx.db.query("personalPlanSteps").withIndex("by_step_id", query => query.eq("stepId", args.stepId)).unique()
    if (!step) throw new Error("Návrh neexistuje")
    if (step.status !== "PROPOSED") throw new Error("O návrhu už bolo rozhodnuté")
    const now = Date.now()
    const status = args.decision === "APPROVE" ? "APPROVED" : args.decision === "POSTPONE" ? "POSTPONED" : "DISMISSED"
    await ctx.db.patch(step._id, { status, deadline: args.decision === "POSTPONE" ? now + 86_400_000 : step.deadline, updatedAt: now })
    let taskId: string|undefined
    if (args.decision === "APPROVE") {
      taskId = `PLAN-${step.stepId}`.slice(0, 120)
      const existing = await ctx.db.query("chiefOfStaffTasks").withIndex("by_task_id", query => query.eq("taskId", taskId!)).unique()
      if (!existing) await ctx.db.insert("chiefOfStaffTasks", {
        taskId, projectId: "", title: step.title, details: `Schválený návrh z plánu ${step.planId}.`, owner: "Tomáš",
        assignee: step.assignedAgent, priority: step.priority, status: "NOVÉ",
        deadline: step.deadline ? new Date(step.deadline).toISOString().slice(0, 10) : undefined,
        expectedOutput: step.expectedOutput, result: "", approval: "Schválené vlastníkom",
        source: "Personal Operations Planner", createdAt: now, updatedAt: now,
      })
    }
    return { ok: true, status, taskId }
  },
})
