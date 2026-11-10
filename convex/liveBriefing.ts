import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action } from "./_generated/server"

const calendarItem = v.object({ id: v.string(), title: v.string(), start: v.string(), end: v.string(), allDay: v.boolean(), url: v.string() })
const emailItem = v.object({ id: v.string(), threadId: v.string(), subject: v.string(), sender: v.string(), timestamp: v.string(), preview: v.string(), url: v.string(), important: v.boolean() })
const agentItem = v.object({ id: v.string(), name: v.string(), role: v.string(), connection: v.string(), status: v.string(), lastCheck: v.string(), currentTask: v.string(), nextStep: v.string(), owner: v.string(), notes: v.string() })
const workItem = v.object({ id: v.string(), projectId: v.string(), title: v.string(), owner: v.string(), priority: v.string(), status: v.string(), updated: v.string(), deadline: v.string(), expectedOutput: v.string(), result: v.string(), nextAgent: v.string(), approval: v.string(), error: v.string(), notes: v.string() })
const taskItem = v.object({ id: v.string(), created: v.string(), source: v.string(), title: v.string(), details: v.string(), projectId: v.string(), owner: v.string(), priority: v.string(), status: v.string(), deadline: v.string(), reminder: v.string(), recurrence: v.string(), related: v.string(), result: v.string(), updated: v.string() })
const commandItem = v.object({ id: v.string(), received: v.string(), channel: v.string(), contextType: v.string(), contextId: v.string(), command: v.string(), intent: v.string(), targetApp: v.string(), approval: v.string(), status: v.string(), agent: v.string(), result: v.string(), error: v.string(), runId: v.string(), updated: v.string() })

export const refresh = action({
  args: {},
  returns: v.object({
    generatedAt: v.number(), calendar: v.array(calendarItem), emails: v.array(emailItem),
    agents: v.array(agentItem), workQueue: v.array(workItem), tasks: v.array(taskItem),
    commands: v.array(commandItem), sourceErrors: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) throw new Error("Nemáš oprávnenie obnoviť súkromné zdroje.")
    const snapshot = await ctx.runQuery(internal.chiefOfStaff.getSnapshot, {})
    if (!snapshot) throw new Error("Chief of Staff snapshot zatiaľ nie je pripravený.")
    return {
      generatedAt: snapshot.syncedAt,
      calendar: snapshot.calendar as Array<{ id:string; title:string; start:string; end:string; allDay:boolean; url:string }>,
      emails: snapshot.emails as Array<{ id:string; threadId:string; subject:string; sender:string; timestamp:string; preview:string; url:string; important:boolean }>,
      agents: snapshot.agents as Array<{ id:string; name:string; role:string; connection:string; status:string; lastCheck:string; currentTask:string; nextStep:string; owner:string; notes:string }>,
      workQueue: snapshot.workQueue as Array<{ id:string; projectId:string; title:string; owner:string; priority:string; status:string; updated:string; deadline:string; expectedOutput:string; result:string; nextAgent:string; approval:string; error:string; notes:string }>,
      tasks: snapshot.tasks as Array<{ id:string; created:string; source:string; title:string; details:string; projectId:string; owner:string; priority:string; status:string; deadline:string; reminder:string; recurrence:string; related:string; result:string; updated:string }>,
      commands: snapshot.commands as Array<{ id:string; received:string; channel:string; contextType:string; contextId:string; command:string; intent:string; targetApp:string; approval:string; status:string; agent:string; result:string; error:string; runId:string; updated:string }>,
      sourceErrors: snapshot.sourceErrors,
    }
  },
})
