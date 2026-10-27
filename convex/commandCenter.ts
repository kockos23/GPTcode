import { v } from "convex/values"
import { api } from "./_generated/api"
import { action } from "./_generated/server"
import { callMacalyJson } from "./macaly"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function rowsFromResponse(value: unknown): unknown[][] {
  const root = record(value)
  const result = record(root.result)
  const data = record(result.data)
  const values = data.values
  return Array.isArray(values) ? values.filter(Array.isArray) as unknown[][] : []
}

function todayBratislava(): string {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Bratislava",
  }).format(new Date())
}

function timestampBratislava(): string {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava",
  }).format(new Date())
}

function nextId(rows: unknown[][], prefix: string): string {
  const max = rows.slice(1).reduce((current, row) => {
    const match = stringValue(row[0]).match(new RegExp("^" + prefix + "(\\d+)$"))
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return prefix + String(max + 1).padStart(3, "0")
}

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

async function readRows(sheetName: string): Promise<unknown[][]> {
  const spreadsheetId = "17_KPHzy339SO53_ov-Cpg-KscfsYwr-iMkK5ZnmSGEk"
  const response = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_GET_SPREADSHEET_VALUES", appName: "GOOGLEDRIVE",
    params: {
      spreadsheet_id: spreadsheetId,
      range: `'${sheetName}'!A1:Z500`,
      major_dimension: "ROWS",
      value_render_option: "FORMATTED_VALUE",
    },
  })
  return rowsFromResponse(response)
}

async function writeRow(sheetName: string, rowNumber: number, endColumn: string, values: unknown[]) {
  const spreadsheetId = "17_KPHzy339SO53_ov-Cpg-KscfsYwr-iMkK5ZnmSGEk"
  const response = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_UPDATE_SPREADSHEET_VALUES", appName: "GOOGLEDRIVE",
    params: {
      spreadsheet_id: spreadsheetId,
      range: `'${sheetName}'!A${rowNumber}:${endColumn}${rowNumber}`,
      value_input_option: "RAW",
      major_dimension: "ROWS",
      include_values_in_response: true,
      values: [values],
    },
  })
  const root = record(response)
  const result = record(root.result)
  if (result.successful === false) throw new Error(stringValue(result.error) || "Zápis do Control Center zlyhal.")
}

async function writeRange(sheetName: string, range: string, values: unknown[][]) {
  const response = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_UPDATE_SPREADSHEET_VALUES", appName: "GOOGLEDRIVE",
    params: {
      spreadsheet_id: "17_KPHzy339SO53_ov-Cpg-KscfsYwr-iMkK5ZnmSGEk",
      range: `'${sheetName}'!${range}`,
      value_input_option: "RAW",
      major_dimension: "ROWS",
      include_values_in_response: true,
      values,
    },
  })
  const result = record(record(response).result)
  if (result.successful === false) throw new Error("Zápis do Control Center zlyhal.")
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
      const rows = await readRows("Agent Work Queue")
      const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => stringValue(row[0]) === taskId)
      if (matches.length !== 1) {
        return { ok: false, code: "NOT_FOUND", message: "Úloha sa v registri nenašla jednoznačne.", status: "" }
      }
      const { row, index } = matches[0]
      const oldStatus = stringValue(row[6])
      if (oldStatus !== "ČAKÁ NA SCHVÁLENIE") {
        return { ok: false, code: "CONFLICT", message: "Úloha už nečaká na schválenie. Obnov prehľad.", status: oldStatus }
      }
      const status = args.decision === "approve" ? "READY" : "PLÁNOVANÉ"
      const date = timestampBratislava()
      const rowNumber = index + 1
      const eventRows = await readRows("Agent Activity Log")
      const eventId = nextId(eventRows, "E")
      const eventRowNumber = Math.max(eventRows.length + 1, 2)
      const correlationId = "APR-" + Date.now()

      await writeRange("Agent Work Queue", `G${rowNumber}:I${rowNumber}`, [[status, stringValue(row[7]), date]])
      try {
        await writeRow("Agent Activity Log", eventRowNumber, "K", [
          eventId, date, taskId, "COS",
          args.decision === "approve" ? "TASK_APPROVED" : "TASK_POSTPONED",
          oldStatus, status, "", "", correlationId, "Chief of Staff HQ",
        ])
      } catch {
        try {
          await writeRange("Agent Work Queue", `G${rowNumber}:I${rowNumber}`, [[oldStatus, stringValue(row[7]), stringValue(row[8])]])
        } catch {
          return { ok: false, code: "AUDIT_REPAIR", message: "Audit zlyhal a stav môže byť zmenený. Skontroluj register.", status }
        }
        return { ok: false, code: "AUDIT_FAILED", message: "Audit zlyhal. Stav úlohy bol vrátený.", status: oldStatus }
      }
      return {
        ok: true, code: "OK",
        message: args.decision === "approve" ? "Zadanie schválené a pripravené na prevzatie." : "Zadanie odložené.",
        status,
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

    const rows = await readRows("Command Inbox")
    const id = nextId(rows, "CMD")
    const rowNumber = Math.max(rows.length + 1, 2)
    const classified = classify(command)
    const assignedAgent = args.agentId?.trim() || classified.agent
    const received = timestampBratislava()
    const runId = "RUN-" + Date.now()

    await writeRow("Command Inbox", rowNumber, "P", [
      id, received, args.channel ?? "Dashboard", "Tomáš",
      args.contextType ?? "General", args.contextId ?? "", command,
      classified.intent, classified.targetApp, classified.approval,
      "NOVÉ", assignedAgent, "", "", runId, received,
    ])

    return { id, status: "NOVÉ", intent: classified.intent, targetApp: classified.targetApp }
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

    const rows = await readRows("Tasks & Reminders")
    const id = nextId(rows, "T")
    const rowNumber = Math.max(rows.length + 1, 2)
    const date = todayBratislava()

    await writeRow("Tasks & Reminders", rowNumber, "O", [
      id, date, "Dashboard", title, args.details ?? "", args.projectId ?? "",
      "Tomáš", args.priority ?? "DÔLEŽITÉ", "NOVÉ", args.deadline ?? "",
      "", "NIE", "", "", date,
    ])

    return { id, status: "NOVÉ" }
  },
})
