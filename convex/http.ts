import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { downloadBillduDocument, listBillduDocuments } from "./billdu"
import { httpCapture, httpContext, httpDigest, httpDigestInput } from "./ideaVault"

const http = httpRouter()

auth.addHttpRoutes(http)

export function constantTimeTextEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function authorizedN8n(request: Request): boolean {
  const configuredSecret = process.env.N8N_INTEGRATION_SECRET
  const authorization = request.headers.get("authorization") ?? ""
  return Boolean(configuredSecret) && constantTimeTextEqual(authorization, `Bearer ${configuredSecret}`)
}

function authorizedAgent(request: Request): boolean {
  const configuredSecret = process.env.AGENT_HANDOFF_SECRET
  const authorization = request.headers.get("authorization") ?? ""
  return Boolean(configuredSecret) && constantTimeTextEqual(authorization, `Bearer ${configuredSecret}`)
}

function safeAgentText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : ""
}

function safeArtifactUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => {
    if (typeof item !== "string" || item.length > 1000) return false
    try { return new URL(item).protocol === "https:" } catch { return false }
  }).slice(0, 20)
}

const agentToolDefinitions = [
  { name: "list_handoffs", description: "List coordination handoffs addressed to GROK_BOT without claiming them.", inputSchema: { type: "object", additionalProperties: false, properties: { threadId: { type: "string" }, limit: { type: "number", minimum: 1, maximum: 50 } } } },
  { name: "claim_handoffs", description: "Atomically claim pending GROK_BOT work with a 15 minute lease.", inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "number", minimum: 1, maximum: 10 } } } },
  { name: "send_handoff", description: "Send an idempotent structured handoff from GROK_BOT to one or more collaborating agents.", inputSchema: { type: "object", additionalProperties: false, properties: { handoffId: { type: "string" }, threadId: { type: "string" }, toAgents: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 }, kind: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, context: { type: "string" }, requestedAction: { type: "string" }, priority: { type: "string" }, artifactUrls: { type: "array", items: { type: "string", format: "uri" }, maxItems: 20 }, correlationId: { type: "string" } }, required: ["handoffId", "threadId", "toAgents", "title", "requestedAction"] } },
  { name: "complete_handoff", description: "Complete or block a handoff currently claimed by GROK_BOT.", inputSchema: { type: "object", additionalProperties: false, properties: { handoffId: { type: "string" }, ok: { type: "boolean" }, result: { type: "string" }, error: { type: "string" }, artifactUrls: { type: "array", items: { type: "string", format: "uri" }, maxItems: 20 } }, required: ["handoffId", "ok"] } },
] as const

function mcpResult(id: unknown, value: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result: value }, { headers: { "cache-control": "no-store" } })
}

function mcpError(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: { "cache-control": "no-store" } })
}

function mcpToolContent(value: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError }
}

const MAX_REGISTER_ROWS = 5001
const MAX_REGISTER_COLUMNS = 100
const MAX_REGISTER_CELL_CHARS = 5000
const MAX_REGISTER_TOTAL_CHARS = 10_000_000

export function validRegisterRows(value: unknown): value is unknown[][] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_REGISTER_ROWS) return false
  let totalChars = 0
  for (const row of value) {
    if (!Array.isArray(row) || row.length > MAX_REGISTER_COLUMNS) return false
    for (const cell of row) {
      if (cell !== null && !["string", "number", "boolean"].includes(typeof cell)) return false
      const length = typeof cell === "string" ? cell.length : String(cell ?? "").length
      if (length > MAX_REGISTER_CELL_CHARS) return false
      totalChars += length
      if (totalChars > MAX_REGISTER_TOTAL_CHARS) return false
    }
  }
  return true
}

export function allowedDriveUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "drive.google.com"
  } catch {
    return false
  }
}

http.route({
  path: "/integrations/n8n/bank-statements",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const sourceFileId = typeof body?.sourceFileId === "string" ? body.sourceFileId : ""
    const sourceFileName = typeof body?.sourceFileName === "string" ? body.sourceFileName : ""
    const sourceFileUrl = typeof body?.sourceFileUrl === "string" ? body.sourceFileUrl : ""
    const csvText = typeof body?.csvText === "string" ? body.csvText : ""
    if (!sourceFileId || !sourceFileName || !allowedDriveUrl(sourceFileUrl) || !csvText || csvText.length > 10_000_000) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    try {
      const result = await ctx.runAction(internal.bankStatements.importBankStatementFromN8n, {
        sourceFileId, sourceFileName, sourceFileUrl, csvText,
        pdfFileId: typeof body?.pdfFileId === "string" ? body.pdfFileId : undefined,
        pdfFileName: typeof body?.pdfFileName === "string" ? body.pdfFileName : undefined,
      })
      return Response.json(result)
    } catch (error) {
      console.error("[n8n bank import] Import failed", error)
      return Response.json({ ok: false, code: "IMPORT_FAILED" }, { status: 422 })
    }
  }),
})

http.route({
  path: "/integrations/n8n/finance-reviews",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const text = (key: string, limit = 500) => typeof body?.[key] === "string" ? String(body[key]).trim().slice(0, limit) : ""
    const documentId = text("documentId", 180)
    const source = text("source", 40)
    const sourceFileId = text("sourceFileId", 180)
    const sourceFileName = text("sourceFileName", 240)
    const fileUrl = text("fileUrl", 500)
    const reviewReason = text("reviewReason", 1000)
    if (!documentId || !source || !sourceFileId || !sourceFileName || !allowedDriveUrl(fileUrl) || !reviewReason) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const totalAmount = typeof body?.totalAmount === "number" && Number.isFinite(body.totalAmount)
      ? body.totalAmount : undefined
    const result = await ctx.runMutation(internal.financeReviews.upsertFromN8n, {
      documentId, source, sourceFileId, sourceFileName, fileUrl, reviewReason,
      supplier: text("supplier", 240), invoiceNumber: text("invoiceNumber", 120),
      totalAmount,
      extractedDeliveryDate: text("deliveryDate", 10) || undefined,
      extractedCategory: text("category", 40) || undefined,
      extractedCurrency: text("currency", 3).toUpperCase() || undefined,
    })
    return Response.json({ ok: true, ...result })
  }),
})

http.route({
  path: "/integrations/n8n/finance-register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const sourceRows = body?.sourceRows
    if (!validRegisterRows(sourceRows)) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    try {
      const result = await ctx.runMutation(internal.wofFinance.syncPayablesFromN8n, {
        sourceRows,
        syncedAt: typeof body?.syncedAt === "number" ? body.syncedAt : Date.now(),
      })
      return Response.json(result)
    } catch (error) {
      console.error("[n8n finance register] Sync failed", error)
      return Response.json({ ok: false, code: "SYNC_FAILED" }, { status: 422 })
    }
  }),
})

http.route({
  path: "/integrations/n8n/billdu/documents",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const page = typeof body?.page === "number" && Number.isInteger(body.page) ? body.page : 1
    const limit = typeof body?.limit === "number" && Number.isInteger(body.limit) ? body.limit : 100
    if (page < 1 || page > 10_000 || limit < 1 || limit > 100) {
      return Response.json({ ok: false, code: "INVALID_PAGINATION" }, { status: 400 })
    }
    try {
      return Response.json({ ok: true, data: await listBillduDocuments(page, limit) })
    } catch (error) {
      console.error("[n8n Billdu] List failed", error)
      return Response.json({ ok: false, code: "BILLDU_LIST_FAILED" }, { status: 502 })
    }
  }),
})

http.route({
  path: "/integrations/n8n/billdu/documents/download",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const id = typeof body?.id === "string" ? body.id.trim() : ""
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return Response.json({ ok: false, code: "INVALID_DOCUMENT_ID" }, { status: 400 })
    try {
      const document = await downloadBillduDocument(id)
      return new Response(document.bytes, {
        headers: {
          "content-type": document.contentType,
          "content-disposition": `attachment; filename="billdu-${id}.pdf"`,
          "cache-control": "no-store",
        },
      })
    } catch (error) {
      console.error("[n8n Billdu] Download failed", error)
      return Response.json({ ok: false, code: "BILLDU_DOWNLOAD_FAILED" }, { status: 502 })
    }
  }),
})

http.route({
  path: "/integrations/n8n/billdu/imports/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const text = (key: string, limit: number) => typeof body?.[key] === "string" ? body[key].trim().slice(0, limit) : ""
    const sourceDocumentId = text("sourceDocumentId", 120)
    const sourceVersion = text("sourceVersion", 180)
    const invoiceNumber = text("invoiceNumber", 120)
    const deliveryDate = text("deliveryDate", 10)
    const currency = text("currency", 3).toUpperCase()
    const totalAmount = typeof body?.totalAmount === "number" && Number.isFinite(body.totalAmount) ? body.totalAmount : -1
    const parsedDeliveryDate = Date.parse(deliveryDate + "T00:00:00Z")
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
      && Number.isFinite(parsedDeliveryDate)
      && new Date(parsedDeliveryDate).toISOString().slice(0, 10) === deliveryDate
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(sourceDocumentId) || !sourceVersion || !invoiceNumber || !validDate || !/^[A-Z]{3}$/.test(currency) || totalAmount < 0) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.billduImports.claim, {
      sourceDocumentId, sourceVersion, invoiceNumber, deliveryDate, currency, totalAmount,
    })
    return Response.json({ ok: true, ...result })
  }),
})

http.route({
  path: "/integrations/n8n/billdu/imports/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const text = (key: string, limit: number) => typeof body?.[key] === "string" ? body[key].trim().slice(0, limit) : ""
    const sourceDocumentId = text("sourceDocumentId", 120)
    const sourceVersion = text("sourceVersion", 180)
    const attempt = typeof body?.attempt === "number" && Number.isInteger(body.attempt) ? body.attempt : 0
    const driveFileUrl = text("driveFileUrl", 500)
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(sourceDocumentId) || !sourceVersion || attempt < 1 || typeof body?.ok !== "boolean") {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    if (body.ok && !allowedDriveUrl(driveFileUrl)) {
      return Response.json({ ok: false, code: "INVALID_DRIVE_URL" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.billduImports.complete, {
      sourceDocumentId, sourceVersion, attempt, ok: body.ok,
      driveFileId: text("driveFileId", 180) || undefined,
      driveFileUrl: driveFileUrl || undefined,
      registerDocumentId: text("registerDocumentId", 180) || undefined,
      error: text("error", 500) || undefined,
    })
    return Response.json(result, { status: result.ok ? 200 : 409 })
  }),
})

http.route({
  path: "/integrations/n8n/chief-of-staff/snapshot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const collections = ["calendar", "emails", "agents", "workQueue", "tasks", "commands"] as const
    if (!body || collections.some(key => !Array.isArray(body[key]) || (body[key] as unknown[]).length > 500)) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const sourceErrors = Array.isArray(body.sourceErrors)
      ? body.sourceErrors.filter((item): item is string => typeof item === "string").slice(0, 20)
      : []
    const result = await ctx.runMutation(internal.chiefOfStaff.syncSnapshot, {
      calendar: body.calendar, emails: body.emails, agents: body.agents,
      workQueue: body.workQueue, tasks: body.tasks, commands: body.commands,
      sourceErrors, syncedAt: typeof body.syncedAt === "number" ? body.syncedAt : Date.now(),
    })
    return Response.json(result)
  }),
})

http.route({
  path: "/integrations/n8n/chief-of-staff/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const result = await ctx.runQuery(internal.chiefOfStaff.health, {})
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    })
  }),
})

http.route({
  path: "/integrations/n8n/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const result = await ctx.runQuery(internal.financeHealth.snapshot, {})
    return Response.json(result, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } })
  }),
})

http.route({
  path: "/integrations/n8n/finance-commands",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const rows = await ctx.runMutation(internal.financeCommands.claimPending, {})
    return Response.json({ ok: true, rows })
  }),
})

http.route({
  path: "/integrations/n8n/finance-commands/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const commandId = typeof body?.commandId === "string" ? body.commandId.trim().slice(0, 180) : ""
    const attempt = typeof body?.attempt === "number" && Number.isInteger(body.attempt) ? body.attempt : 0
    if (!commandId || attempt < 1 || typeof body?.ok !== "boolean") {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.financeCommands.complete, {
      commandId,
      attempt,
      ok: body.ok,
      message: typeof body.message === "string" ? body.message.trim().slice(0, 500) : undefined,
      error: typeof body.error === "string" ? body.error.trim().slice(0, 500) : undefined,
    })
    return Response.json(result, { status: result.ok ? 200 : 404 })
  }),
})

http.route({
  path: "/integrations/n8n/finance-review-resolutions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const rows = await ctx.runQuery(internal.financeReviews.listReadyRows, {})
    return Response.json({ ok: true, rows })
  }),
})

http.route({
  path: "/integrations/n8n/finance-review-resolutions/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedN8n(request)) {
      return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    }
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const documentId = typeof body?.documentId === "string" ? body.documentId.trim().slice(0, 180) : ""
    if (!documentId || typeof body?.ok !== "boolean") {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const targetFileUrl = typeof body.targetFileUrl === "string" ? body.targetFileUrl.trim().slice(0, 500) : ""
    if (body.ok && !allowedDriveUrl(targetFileUrl)) {
      return Response.json({ ok: false, code: "INVALID_DRIVE_URL" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.financeReviews.completeFromN8n, {
      documentId, ok: body.ok,
      targetFileId: typeof body.targetFileId === "string" ? body.targetFileId.trim().slice(0, 180) : undefined,
      targetFileUrl: targetFileUrl || undefined,
      error: typeof body.error === "string" ? body.error.trim().slice(0, 500) : undefined,
    })
    return Response.json(result, { status: result.ok ? 200 : 404 })
  }),
})

http.route({
  path: "/integrations/agents/handoffs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedAgent(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const url = new URL(request.url)
    const rows = await ctx.runQuery(internal.agentHandoffs.list, {
      agent: safeAgentText(url.searchParams.get("agent"), 80) || undefined,
      threadId: safeAgentText(url.searchParams.get("threadId"), 120) || undefined,
      limit: Number(url.searchParams.get("limit") || 25),
    })
    return Response.json({ ok: true, rows }, { headers: { "cache-control": "no-store" } })
  }),
})

http.route({
  path: "/integrations/agents/handoffs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedAgent(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const toAgents = Array.isArray(body?.toAgents)
      ? body.toAgents.map(value => safeAgentText(value, 80)).filter(Boolean).slice(0, 10) : []
    const args = {
      handoffId: safeAgentText(body?.handoffId, 120), threadId: safeAgentText(body?.threadId, 120),
      fromAgent: safeAgentText(body?.fromAgent, 80), toAgents,
      kind: safeAgentText(body?.kind, 40), title: safeAgentText(body?.title, 240),
      summary: safeAgentText(body?.summary, 2000), context: safeAgentText(body?.context, 10_000),
      requestedAction: safeAgentText(body?.requestedAction, 2000), priority: safeAgentText(body?.priority, 20),
      artifactUrls: safeArtifactUrls(body?.artifactUrls), correlationId: safeAgentText(body?.correlationId, 120),
    }
    if (!args.handoffId || !args.threadId || !args.fromAgent || !args.toAgents.length || !args.title || !args.requestedAction) {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    return Response.json(await ctx.runMutation(internal.agentHandoffs.submit, args))
  }),
})

http.route({
  path: "/integrations/agents/handoffs/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedAgent(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const agent = safeAgentText(body?.agent, 80)
    if (!agent) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    const rows = await ctx.runMutation(internal.agentHandoffs.claim, {
      agent, limit: typeof body?.limit === "number" ? body.limit : undefined,
    })
    return Response.json({ ok: true, rows })
  }),
})

http.route({
  path: "/integrations/agents/handoffs/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedAgent(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    const handoffId = safeAgentText(body?.handoffId, 120)
    const agent = safeAgentText(body?.agent, 80)
    if (!handoffId || !agent || typeof body?.ok !== "boolean") {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.agentHandoffs.complete, {
      handoffId, agent, ok: body.ok,
      result: safeAgentText(body?.result, 10_000) || undefined,
      error: safeAgentText(body?.error, 2000) || undefined,
      artifactUrls: safeArtifactUrls(body?.artifactUrls),
    })
    return Response.json(result, { status: result.ok ? 200 : 409 })
  }),
})

// Stateless Streamable HTTP MCP endpoint for standalone assistants such as Grok Bot.
// It exposes only the handoff bus, never Convex or n8n administration.
http.route({
  path: "/integrations/agents/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorizedAgent(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 })
    const body = await request.json().catch(() => null) as null | Record<string, unknown>
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return mcpError(body?.id ?? null, -32600, "Invalid Request")
    const id = body.id ?? null
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 })
    if (body.method === "ping") return mcpResult(id, {})
    if (body.method === "initialize") return mcpResult(id, {
      protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "WOF Chief of Staff Agent Bus", version: "1.0.0" },
      instructions: "Use identity GROK_BOT. Claim work before completing it. Never include passwords, API keys, or private tokens in handoffs.",
    })
    if (body.method === "tools/list") return mcpResult(id, { tools: agentToolDefinitions })
    if (body.method !== "tools/call") return mcpError(id, -32601, "Method not found")
    const params = body.params as undefined | Record<string, unknown>
    const name = safeAgentText(params?.name, 80)
    const args = (params?.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>
    try {
      if (name === "list_handoffs") {
        const rows = await ctx.runQuery(internal.agentHandoffs.list, { agent: "GROK_BOT", threadId: safeAgentText(args.threadId, 120) || undefined, limit: typeof args.limit === "number" ? args.limit : undefined })
        return mcpResult(id, mcpToolContent({ ok: true, rows }))
      }
      if (name === "claim_handoffs") {
        const rows = await ctx.runMutation(internal.agentHandoffs.claim, { agent: "GROK_BOT", limit: typeof args.limit === "number" ? args.limit : undefined })
        return mcpResult(id, mcpToolContent({ ok: true, rows }))
      }
      if (name === "send_handoff") {
        const toAgents = Array.isArray(args.toAgents) ? args.toAgents.map(value => safeAgentText(value, 80)).filter(Boolean).slice(0, 10) : []
        const payload = {
          handoffId: safeAgentText(args.handoffId, 120), threadId: safeAgentText(args.threadId, 120), fromAgent: "GROK_BOT", toAgents,
          kind: safeAgentText(args.kind, 40), title: safeAgentText(args.title, 240), summary: safeAgentText(args.summary, 4000), context: safeAgentText(args.context, 12000),
          requestedAction: safeAgentText(args.requestedAction, 4000), priority: safeAgentText(args.priority, 20), artifactUrls: safeArtifactUrls(args.artifactUrls), correlationId: safeAgentText(args.correlationId, 120),
        }
        if (!payload.handoffId || !payload.threadId || !payload.fromAgent || !payload.toAgents.length || !payload.title || !payload.requestedAction) return mcpResult(id, mcpToolContent({ code: "INVALID_PAYLOAD" }, true))
        return mcpResult(id, mcpToolContent(await ctx.runMutation(internal.agentHandoffs.submit, payload)))
      }
      if (name === "complete_handoff") {
        const handoffId = safeAgentText(args.handoffId, 120)
        if (!handoffId || typeof args.ok !== "boolean") return mcpResult(id, mcpToolContent({ code: "INVALID_PAYLOAD" }, true))
        const result = await ctx.runMutation(internal.agentHandoffs.complete, { handoffId, agent: "GROK_BOT", ok: args.ok, result: safeAgentText(args.result, 10000) || undefined, error: safeAgentText(args.error, 2000) || undefined, artifactUrls: safeArtifactUrls(args.artifactUrls) })
        return mcpResult(id, mcpToolContent(result, !result.ok))
      }
      return mcpResult(id, mcpToolContent({ code: "UNKNOWN_TOOL" }, true))
    } catch {
      return mcpResult(id, mcpToolContent({ code: "TOOL_EXECUTION_FAILED" }, true))
    }
  }),
})

// VERA · Idea Vault – volá iba n8n s hlavičkou Authorization: Bearer <token>.
http.route({ path: "/ideas/context", method: "GET", handler: httpContext })
http.route({ path: "/ideas/capture", method: "POST", handler: httpCapture })
http.route({ path: "/ideas/digest-input", method: "GET", handler: httpDigestInput })
http.route({ path: "/ideas/digest", method: "POST", handler: httpDigest })

export default http
