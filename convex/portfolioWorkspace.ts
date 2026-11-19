import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"

async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  if (user?.email?.trim().toLowerCase() !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

const projectInput = v.object({
  id: v.string(), area: v.string(), name: v.string(), status: v.string(), priority: v.string(), owner: v.string(),
  horizon: v.string(), deadline: v.optional(v.string()), nextAction: v.string(), blocker: v.optional(v.string()),
  waitingFor: v.optional(v.string()), progress: v.number(),
})
const decisionInput = v.object({
  id: v.string(), projectId: v.string(), question: v.string(), recommendation: v.string(), alternatives: v.array(v.string()),
  reason: v.string(), impact: v.string(), deadline: v.string(), status: v.string(), context: v.string(), source: v.string(),
  relatedTask: v.optional(v.string()), answer: v.optional(v.string()),
})

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx)
    const [projects, decisions] = await Promise.all([
      ctx.db.query("chiefOfStaffProjects").collect(),
      ctx.db.query("chiefOfStaffDecisions").collect(),
    ])
    return {
      projects: projects.sort((a, b) => a.projectId.localeCompare(b.projectId)).map(row => ({
        id: row.projectId, area: row.area, name: row.name, status: row.status, priority: row.priority, owner: row.owner,
        horizon: row.horizon, deadline: row.deadline, nextAction: row.nextAction, blocker: row.blocker,
        waitingFor: row.waitingFor, progress: row.progress,
      })),
      decisions: decisions.sort((a, b) => a.decisionId.localeCompare(b.decisionId)).map(row => ({
        id: row.decisionId, projectId: row.projectId, question: row.question, recommendation: row.recommendation,
        alternatives: row.alternatives, reason: row.reason, impact: row.impact, deadline: row.deadline, status: row.status,
        context: row.context, source: row.source, relatedTask: row.relatedTask, answer: row.answer,
      })),
    }
  },
})

export const bootstrapDefaults = mutation({
  args: { projects: v.array(projectInput), decisions: v.array(decisionInput) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    if (args.projects.length > 100 || args.decisions.length > 200) throw new Error("TOO_MANY_ROWS")
    const now = Date.now()
    let createdProjects = 0
    let createdDecisions = 0
    for (const row of args.projects) {
      const id = row.id.trim().slice(0, 120)
      if (!id || await ctx.db.query("chiefOfStaffProjects").withIndex("by_project_id", q => q.eq("projectId", id)).unique()) continue
      await ctx.db.insert("chiefOfStaffProjects", {
        projectId: id, area: row.area.slice(0, 100), name: row.name.slice(0, 300), status: row.status.slice(0, 40),
        priority: row.priority.slice(0, 20), owner: row.owner.slice(0, 120), horizon: row.horizon.slice(0, 80),
        deadline: row.deadline?.slice(0, 40), nextAction: row.nextAction.slice(0, 1000), blocker: row.blocker?.slice(0, 1000),
        waitingFor: row.waitingFor?.slice(0, 300), progress: Math.max(0, Math.min(100, row.progress)), createdAt: now, updatedAt: now,
      })
      createdProjects += 1
    }
    for (const row of args.decisions) {
      const id = row.id.trim().slice(0, 120)
      if (!id || await ctx.db.query("chiefOfStaffDecisions").withIndex("by_decision_id", q => q.eq("decisionId", id)).unique()) continue
      await ctx.db.insert("chiefOfStaffDecisions", {
        decisionId: id, projectId: row.projectId.slice(0, 120), question: row.question.slice(0, 500),
        recommendation: row.recommendation.slice(0, 2000), alternatives: row.alternatives.slice(0, 20).map(value => value.slice(0, 500)),
        reason: row.reason.slice(0, 2000), impact: row.impact.slice(0, 2000), deadline: row.deadline.slice(0, 40),
        status: row.status.slice(0, 40), context: row.context.slice(0, 5000), source: row.source.slice(0, 500),
        relatedTask: row.relatedTask?.slice(0, 120), answer: row.answer?.slice(0, 5000), createdAt: now, updatedAt: now,
      })
      createdDecisions += 1
    }
    return { ok: true, createdProjects, createdDecisions }
  },
})

export const updateDecision = mutation({
  args: { decisionId: v.string(), status: v.string(), answer: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const row = await ctx.db.query("chiefOfStaffDecisions").withIndex("by_decision_id", q => q.eq("decisionId", args.decisionId)).unique()
    if (!row) throw new Error("DECISION_NOT_FOUND")
    await ctx.db.patch(row._id, { status: args.status.slice(0, 40), answer: args.answer?.trim().slice(0, 5000), updatedAt: Date.now() })
    return { ok: true }
  },
})

export const updateProject = mutation({
  args: { projectId: v.string(), status: v.optional(v.string()), priority: v.optional(v.string()), progress: v.optional(v.number()), nextAction: v.optional(v.string()), blocker: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const row = await ctx.db.query("chiefOfStaffProjects").withIndex("by_project_id", q => q.eq("projectId", args.projectId)).unique()
    if (!row) throw new Error("PROJECT_NOT_FOUND")
    await ctx.db.patch(row._id, {
      status: args.status?.slice(0, 40) ?? row.status, priority: args.priority?.slice(0, 20) ?? row.priority,
      progress: args.progress === undefined ? row.progress : Math.max(0, Math.min(100, args.progress)),
      nextAction: args.nextAction?.trim().slice(0, 1000) ?? row.nextAction,
      blocker: args.blocker?.trim().slice(0, 1000) || undefined, updatedAt: Date.now(),
    })
    return { ok: true }
  },
})
