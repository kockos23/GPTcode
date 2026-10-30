import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { downloadBillduDocument, listBillduDocuments } from "./billdu"

const http = httpRouter()

auth.addHttpRoutes(http)

function authorizedN8n(request: Request): boolean {
  const configuredSecret = process.env.N8N_INTEGRATION_SECRET
  const authorization = request.headers.get("authorization") ?? ""
  return Boolean(configuredSecret) && authorization === `Bearer ${configuredSecret}`
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
    if (!sourceFileId || !sourceFileName || !sourceFileUrl || !csvText || csvText.length > 10_000_000) {
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
    if (!documentId || !source || !sourceFileId || !sourceFileName || !fileUrl || !reviewReason) {
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
    const sourceRows = Array.isArray(body?.sourceRows) ? body.sourceRows.filter(Array.isArray) : []
    if (!sourceRows.length || sourceRows.length > 5001) {
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
    if (!commandId || typeof body?.ok !== "boolean") {
      return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
    }
    const result = await ctx.runMutation(internal.financeCommands.complete, {
      commandId,
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
    const result = await ctx.runMutation(internal.financeReviews.completeFromN8n, {
      documentId, ok: body.ok,
      targetFileId: typeof body.targetFileId === "string" ? body.targetFileId.trim().slice(0, 180) : undefined,
      targetFileUrl: typeof body.targetFileUrl === "string" ? body.targetFileUrl.trim().slice(0, 500) : undefined,
      error: typeof body.error === "string" ? body.error.trim().slice(0, 500) : undefined,
    })
    return Response.json(result, { status: result.ok ? 200 : 404 })
  }),
})

export default http
