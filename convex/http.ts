import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"

const http = httpRouter()

auth.addHttpRoutes(http)

http.route({
  path: "/integrations/n8n/bank-statements",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = process.env.N8N_INTEGRATION_SECRET
    const authorization = request.headers.get("authorization") ?? ""
    if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
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

export default http
