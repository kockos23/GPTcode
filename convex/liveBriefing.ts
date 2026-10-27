import { v } from "convex/values"
import { api } from "./_generated/api"
import { action } from "./_generated/server"
import { callMacalyJson } from "./macaly"

type UnknownRecord = Record<string, unknown>
type Settled = PromiseSettledResult<unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function rowValue(row: unknown[], index: number): string {
  return stringValue(row[index])
}

function settledPayload(item: Settled, service: string): { payload: UnknownRecord; error: string } {
  if (item.status === "rejected") {
    return { payload: {}, error: `${service}: ${item.reason instanceof Error ? item.reason.message : "zdroj nie je dostupný"}` }
  }
  const data = record(item.value)
  const result = record(data.result)
  if (result._truncated) return { payload: {}, error: `${service}: odpoveď bola príliš veľká` }
  if (result.successful === false) return { payload: {}, error: `${service}: ${stringValue(result.error) || "požiadavka zlyhala"}` }
  return { payload: record(result.data), error: "" }
}

const calendarItem = v.object({
  id: v.string(), title: v.string(), start: v.string(), end: v.string(),
  allDay: v.boolean(), url: v.string(),
})

const emailItem = v.object({
  id: v.string(), threadId: v.string(), subject: v.string(), sender: v.string(),
  timestamp: v.string(), preview: v.string(), url: v.string(), important: v.boolean(),
})

const agentItem = v.object({
  id: v.string(), name: v.string(), role: v.string(), connection: v.string(),
  status: v.string(), lastCheck: v.string(), currentTask: v.string(),
  nextStep: v.string(), owner: v.string(), notes: v.string(),
})

const workItem = v.object({
  id: v.string(), projectId: v.string(), title: v.string(), owner: v.string(),
  priority: v.string(), status: v.string(), updated: v.string(), deadline: v.string(),
  expectedOutput: v.string(), result: v.string(), nextAgent: v.string(),
  approval: v.string(), error: v.string(), notes: v.string(),
})

const taskItem = v.object({
  id: v.string(), created: v.string(), source: v.string(), title: v.string(),
  details: v.string(), projectId: v.string(), owner: v.string(), priority: v.string(),
  status: v.string(), deadline: v.string(), reminder: v.string(), recurrence: v.string(),
  related: v.string(), result: v.string(), updated: v.string(),
})

const commandItem = v.object({
  id: v.string(), received: v.string(), channel: v.string(), contextType: v.string(),
  contextId: v.string(), command: v.string(), intent: v.string(), targetApp: v.string(),
  approval: v.string(), status: v.string(), agent: v.string(), result: v.string(),
  error: v.string(), runId: v.string(), updated: v.string(),
})

export const refresh = action({
  args: {},
  returns: v.object({
    generatedAt: v.number(),
    calendar: v.array(calendarItem),
    emails: v.array(emailItem),
    agents: v.array(agentItem),
    workQueue: v.array(workItem),
    tasks: v.array(taskItem),
    commands: v.array(commandItem),
    sourceErrors: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) throw new Error("Nemáš oprávnenie obnoviť súkromné zdroje.")

    const now = new Date()
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const spreadsheetId = "17_KPHzy339SO53_ov-Cpg-KscfsYwr-iMkK5ZnmSGEk"

    const calls = await Promise.allSettled([
      callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GOOGLECALENDAR_EVENTS_LIST", appName: "GOOGLECALENDAR",
        params: {
          calendarId: "primary", timeMin: now.toISOString(), timeMax: horizon.toISOString(),
          timeZone: "Europe/Bratislava", orderBy: "startTime", singleEvents: true,
          maxResults: 30, fields: "items(id,summary,start,end,htmlLink,status),nextPageToken",
        },
      }),
      callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GMAIL_FETCH_EMAILS", appName: "GMAIL",
        params: {
          query: "newer_than:7d is:unread -category:promotions -category:social -category:forums",
          max_results: 20, verbose: false, include_payload: false,
          include_spam_trash: false, user_id: "me",
        },
      }),
      callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GOOGLEDRIVE_BATCH_GET_SPREADSHEET_VALUES", appName: "GOOGLEDRIVE",
        params: {
          spreadsheet_id: spreadsheetId,
          ranges: [
            "'Agent Registry'!A1:L20",
            "'Agent Work Queue'!A1:S50",
            "'Tasks & Reminders'!A1:O100",
            "'Command Inbox'!A1:P100",
          ],
          major_dimension: "ROWS", value_render_option: "FORMATTED_VALUE",
        },
      }),
    ])

    const calendarSource = settledPayload(calls[0], "Kalendár")
    const gmailSource = settledPayload(calls[1], "Gmail")
    const driveSource = settledPayload(calls[2], "Agent register")
    const sourceErrors = [calendarSource.error, gmailSource.error, driveSource.error].filter(Boolean)

    const calendar = (Array.isArray(calendarSource.payload.items) ? calendarSource.payload.items : [])
      .map((raw) => {
        const item = record(raw); const start = record(item.start); const end = record(item.end)
        return {
          id: stringValue(item.id), title: stringValue(item.summary) || "Bez názvu",
          start: stringValue(start.dateTime) || stringValue(start.date),
          end: stringValue(end.dateTime) || stringValue(end.date),
          allDay: !start.dateTime, url: stringValue(item.htmlLink),
        }
      }).filter((item) => item.id && item.start)

    const emails = (Array.isArray(gmailSource.payload.messages) ? gmailSource.payload.messages : [])
      .map((raw) => {
        const item = record(raw); const preview = record(item.preview)
        const labels = Array.isArray(item.labelIds) ? item.labelIds.filter((label): label is string => typeof label === "string") : []
        return {
          id: stringValue(item.messageId), threadId: stringValue(item.threadId),
          subject: stringValue(item.subject) || "Bez predmetu", sender: stringValue(item.sender),
          timestamp: stringValue(item.messageTimestamp), preview: stringValue(preview.body).slice(0, 180),
          url: stringValue(item.display_url), important: labels.includes("IMPORTANT"),
        }
      }).filter((item) => item.id)

    const ranges = Array.isArray(driveSource.payload.valueRanges) ? driveSource.payload.valueRanges : []
    const registryRange = record(ranges[0])
    const queueRange = record(ranges[1])
    const tasksRange = record(ranges[2])
    const commandsRange = record(ranges[3])
    const registryRows = Array.isArray(registryRange.values) ? registryRange.values.slice(1) : []
    const queueRows = Array.isArray(queueRange.values) ? queueRange.values.slice(1) : []
    const taskRows = Array.isArray(tasksRange.values) ? tasksRange.values.slice(1) : []
    const commandRows = Array.isArray(commandsRange.values) ? commandsRange.values.slice(1) : []

    const agents = registryRows.filter(Array.isArray).map((raw) => {
      const row = raw as unknown[]
      return {
        id: rowValue(row, 0), name: rowValue(row, 1), role: rowValue(row, 2),
        connection: rowValue(row, 3), status: rowValue(row, 4), lastCheck: rowValue(row, 5),
        currentTask: rowValue(row, 6), nextStep: rowValue(row, 9),
        owner: rowValue(row, 10), notes: rowValue(row, 11),
      }
    }).filter((item) => item.id)

    const workQueue = queueRows.filter(Array.isArray).map((raw) => {
      const row = raw as unknown[]
      return {
        id: rowValue(row, 0), projectId: rowValue(row, 1), title: rowValue(row, 2),
        owner: rowValue(row, 3), priority: rowValue(row, 5), status: rowValue(row, 6),
        updated: rowValue(row, 8), deadline: rowValue(row, 9),
        expectedOutput: rowValue(row, 11), result: rowValue(row, 12),
        nextAgent: rowValue(row, 13), approval: rowValue(row, 14),
        error: rowValue(row, 17), notes: rowValue(row, 18),
      }
    }).filter((item) => item.id)

    const tasks = taskRows.filter(Array.isArray).map((raw) => {
      const row = raw as unknown[]
      return {
        id: rowValue(row, 0), created: rowValue(row, 1), source: rowValue(row, 2),
        title: rowValue(row, 3), details: rowValue(row, 4), projectId: rowValue(row, 5),
        owner: rowValue(row, 6), priority: rowValue(row, 7), status: rowValue(row, 8),
        deadline: rowValue(row, 9), reminder: rowValue(row, 10), recurrence: rowValue(row, 11),
        related: rowValue(row, 12), result: rowValue(row, 13), updated: rowValue(row, 14),
      }
    }).filter((item) => item.id)

    const commands = commandRows.filter(Array.isArray).map((raw) => {
      const row = raw as unknown[]
      return {
        id: rowValue(row, 0), received: rowValue(row, 1), channel: rowValue(row, 2),
        contextType: rowValue(row, 4), contextId: rowValue(row, 5), command: rowValue(row, 6),
        intent: rowValue(row, 7), targetApp: rowValue(row, 8), approval: rowValue(row, 9),
        status: rowValue(row, 10), agent: rowValue(row, 11), result: rowValue(row, 12),
        error: rowValue(row, 13), runId: rowValue(row, 14), updated: rowValue(row, 15),
      }
    }).filter((item) => item.id)

    return { generatedAt: Date.now(), calendar, emails, agents, workQueue, tasks, commands, sourceErrors }
  },
})
