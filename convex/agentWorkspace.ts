import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"

const AGENTS = new Set(["CODEX", "CLAUDE_CODE", "CURSOR", "CURSOR_GROK", "GROK_BOT", "NORA"])
async function requireOwner(ctx: QueryCtx|MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  if (user?.email?.trim().toLowerCase() !== process.env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error("FORBIDDEN")
}

export const overview = query({
  args: {},
  handler: async ctx => {
    await requireOwner(ctx)
    const rows = await ctx.db.query("agentHandoffs").withIndex("by_created_at").order("desc").take(100)
    return { rows, availableAgents: [...AGENTS] }
  },
})

export const createHandoff = mutation({
  args: { toAgent:v.string(), kind:v.string(), title:v.string(), summary:v.string(), requestedAction:v.string(), priority:v.string() },
  handler: async (ctx,args) => {
    await requireOwner(ctx)
    const toAgent=args.toAgent.trim().toUpperCase()
    if(!AGENTS.has(toAgent))throw new Error("UNSUPPORTED_AGENT")
    const title=args.title.trim().slice(0,240),requestedAction=args.requestedAction.trim().slice(0,2000)
    if(!title||!requestedAction)throw new Error("INVALID_HANDOFF")
    const now=Date.now(), handoffId=`owner:${now}:${toAgent}`
    await ctx.db.insert("agentHandoffs",{handoffId,threadId:`owner:${new Date(now).toISOString().slice(0,10)}`,fromAgent:"NORA",toAgents:[toAgent],kind:args.kind.trim().slice(0,40)||"TASK",title,summary:args.summary.trim().slice(0,2000),context:"Vytvorené vlastníkom v Agent Control.",requestedAction,priority:args.priority.trim().slice(0,20)||"P2",status:"NEW",artifactUrls:[],correlationId:handoffId,createdAt:now,updatedAt:now})
    return {ok:true,handoffId}
  },
})
