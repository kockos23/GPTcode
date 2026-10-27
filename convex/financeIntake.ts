import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import { callMacalyJson } from "./macaly"
import { extractDocumentText } from "./documentText"
import { FINANCE_CATEGORIES, routeFinanceDocument, type FinanceCategory } from "./documentRouting"

const WOF_FINANCE_ROOT_ID = "1vkbIi3cQpyN-xkXG3-As2PCYwJaAz0uS"
const WOF_FINANCE_ROOT_URL = "https://drive.google.com/drive/folders/" + WOF_FINANCE_ROOT_ID
const MONTHLY_SUBFOLDERS = ["Doklady", "Stripe", "Vypisy", "Vystavene_FA"] as const
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "heic", "csv", "xls", "xlsx", "xml", "doc", "docx"])
const RUN_RESULT = v.object({
  ok: v.boolean(),
  message: v.string(),
  checkedEmails: v.number(),
  savedFiles: v.number(),
  skippedFiles: v.number(),
  failedFiles: v.number(),
  reviewFiles: v.number(),
})
const CATEGORY_VALIDATOR = v.union(
  v.literal("Doklady"),
  v.literal("Stripe"),
  v.literal("Vypisy"),
  v.literal("Vystavene_FA"),
)

type Row = Record<string, unknown>
function obj(value: unknown): Row { return value && typeof value === "object" ? value as Row : {} }
function str(value: unknown): string { return value == null ? "" : String(value).trim() }
function unwrap(value: unknown): Row {
  const root = obj(value)
  const result = obj(root.result)
  return obj(result.data ?? root.data ?? result)
}
function failed(value: unknown): boolean {
  const root = obj(value)
  const result = obj(root.result)
  return root.successful === false || result.successful === false
}
function headersOf(message: Row): Record<string, string> {
  const raw = obj(message.headers)
  const payload = obj(message.payload)
  const headerList = Array.isArray(raw) ? raw : Array.isArray(payload.headers) ? payload.headers : []
  const result: Record<string, string> = {}
  for (const item of headerList) {
    const header = obj(item)
    const name = str(header.name).toLowerCase()
    if (name) result[name] = str(header.value)
  }
  if (typeof message.subject === "string") result.subject = message.subject
  if (typeof message.from === "string") result.from = message.from
  if (typeof message.date === "string") result.date = message.date
  return result
}
function attachmentsOf(message: Row): { attachmentId: string; fileName: string; mimeType: string }[] {
  const found = new Map<string, { attachmentId: string; fileName: string; mimeType: string }>()
  const direct = Array.isArray(message.attachmentList) ? message.attachmentList : Array.isArray(message.attachments) ? message.attachments : []
  for (const item of direct) {
    const part = obj(item)
    const attachmentId = str(part.attachmentId ?? part.attachment_id)
    const fileName = str(part.filename ?? part.fileName ?? part.name)
    if (attachmentId && fileName) found.set(attachmentId, { attachmentId, fileName, mimeType: str(part.mimeType ?? part.mime_type) })
  }
  const visit = (value: unknown) => {
    const part = obj(value)
    const body = obj(part.body)
    const attachmentId = str(body.attachmentId ?? body.attachment_id ?? part.attachmentId)
    const fileName = str(part.filename ?? part.fileName ?? part.name)
    if (attachmentId && fileName) found.set(attachmentId, { attachmentId, fileName, mimeType: str(part.mimeType ?? part.mime_type) })
    if (Array.isArray(part.parts)) for (const child of part.parts) visit(child)
  }
  visit(message.payload)
  return [...found.values()]
}
function timestampOf(message: Row): number {
  const value = Number(message.internalDate ?? message.receivedAt)
  if (Number.isFinite(value) && value > 0) return value
  const date = headersOf(message).date
  const parsed = date ? Date.parse(date) : NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}
function safeName(name: string, receivedAt: number, messageId: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.() -]/g, "_").replace(/\s+/g, "_").slice(0, 120) || "priloha"
  const date = new Date(receivedAt).toISOString().slice(0, 10)
  const dot = cleaned.lastIndexOf(".")
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const ext = dot > 0 ? cleaned.slice(dot) : ""
  return date + "_" + stem + "_" + messageId.slice(-6) + ext
}
function validDocument(name: string, mimeType: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (!ALLOWED_EXTENSIONS.has(ext)) return false
  return !mimeType || !/(javascript|executable|x-msdownload|application\/x-sh|application\/zip)/i.test(mimeType)
}
function localBratislavaTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now)
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]))
  return { weekday: values.weekday ?? "", hour: Number(values.hour), minute: Number(values.minute) }
}

async function driveFindOrCreateFolder(name: string, parentId: string): Promise<{ id: string; url: string }> {
  const found = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_FIND_FOLDER", appName: "GOOGLEDRIVE",
    params: { name_exact: name, parent_folder_id: parentId, page_size: 100 },
  })
  if (failed(found)) throw new Error("WOF Drive nevedel vyhľadať mesačný priečinok.")
  const files = Array.isArray(unwrap(found).files) ? unwrap(found).files as unknown[] : []
  const existing = obj(files[0])
  if (str(existing.id)) return { id: str(existing.id), url: str(existing.webViewLink) || "https://drive.google.com/drive/folders/" + str(existing.id) }

  const created = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_CREATE_FOLDER", appName: "GOOGLEDRIVE",
    params: { name, parent_id: parentId },
  })
  if (failed(created)) throw new Error("WOF Drive nevedel vytvoriť mesačný priečinok.")
  const folder = unwrap(created)
  const id = str(folder.id ?? obj(folder.file).id)
  if (!id) throw new Error("WOF Drive nevytvoril priečinok " + name + ".")
  return { id, url: str(folder.webViewLink ?? folder.display_url) || "https://drive.google.com/drive/folders/" + id }
}

async function monthlyDestination(deliveryDate: string, category: FinanceCategory) {
  const match = deliveryDate.match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/)
  if (!match || !FINANCE_CATEGORIES.includes(category)) throw new Error("Dátum alebo kategória dokladu nie sú platné.")
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Dátum dodania nie je platný.")
  }
  const monthName = String(month).padStart(2, "0") + "/" + year
  const yearFolder = await driveFindOrCreateFolder(String(year), WOF_FINANCE_ROOT_ID)
  const monthFolder = await driveFindOrCreateFolder(monthName, yearFolder.id)
  for (const name of MONTHLY_SUBFOLDERS) await driveFindOrCreateFolder(name, monthFolder.id)
  const destination = await driveFindOrCreateFolder(category, monthFolder.id)
  return { ...destination, monthName, category }
}

export const getImportByKey = internalQuery({
  args: { gmailKey: v.string() },
  returns: v.union(v.object({
    id: v.id("wofFinanceEmailImports"), gmailKey: v.string(), messageId: v.string(), attachmentId: v.string(),
    fileName: v.string(), sender: v.string(), subject: v.string(), receivedAt: v.number(), status: v.string(),
    driveFileId: v.optional(v.string()), driveUrl: v.optional(v.string()), category: v.optional(v.string()),
    deliveryDate: v.optional(v.string()), routingEvidence: v.optional(v.string()), reviewReason: v.optional(v.string()),
    error: v.optional(v.string()), updatedAt: v.number(),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("wofFinanceEmailImports").withIndex("by_gmail_key", q => q.eq("gmailKey", args.gmailKey)).unique()
    if (!row) return null
    const { _id, _creationTime, ...fields } = row
    return { id: _id, ...fields }
  },
})
export const getImportById = internalQuery({
  args: { id: v.id("wofFinanceEmailImports") },
  returns: v.union(v.object({
    id: v.id("wofFinanceEmailImports"), gmailKey: v.string(), messageId: v.string(), attachmentId: v.string(),
    fileName: v.string(), sender: v.string(), subject: v.string(), receivedAt: v.number(), status: v.string(),
    driveFileId: v.optional(v.string()), driveUrl: v.optional(v.string()), category: v.optional(v.string()),
    deliveryDate: v.optional(v.string()), routingEvidence: v.optional(v.string()), reviewReason: v.optional(v.string()),
    error: v.optional(v.string()), updatedAt: v.number(),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (!row) return null
    const { _id, _creationTime, ...fields } = row
    return { id: _id, ...fields }
  },
})
export const saveImport = internalMutation({
  args: {
    gmailKey: v.string(), messageId: v.string(), attachmentId: v.string(), fileName: v.string(),
    sender: v.string(), subject: v.string(), receivedAt: v.number(), status: v.string(),
    driveFileId: v.optional(v.string()), driveUrl: v.optional(v.string()), category: v.optional(v.string()),
    deliveryDate: v.optional(v.string()), routingEvidence: v.optional(v.string()), reviewReason: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db.query("wofFinanceEmailImports").withIndex("by_gmail_key", q => q.eq("gmailKey", args.gmailKey)).unique()
    const data = { ...args, updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, data)
    else await ctx.db.insert("wofFinanceEmailImports", data)
    return null
  },
})
export const startRun = internalMutation({
  args: { trigger: v.string() },
  returns: v.union(v.id("wofFinanceIntakeRuns"), v.null()),
  handler: async (ctx, args) => {
    const latest = await ctx.db.query("wofFinanceIntakeRuns").withIndex("by_started_at").order("desc").first()
    if (latest?.status === "BEŽÍ" && Date.now() - latest.startedAt < 15 * 60 * 1000) return null
    return ctx.db.insert("wofFinanceIntakeRuns", {
      trigger: args.trigger, startedAt: Date.now(), status: "BEŽÍ",
      checkedEmails: 0, savedFiles: 0, skippedFiles: 0, failedFiles: 0, reviewFiles: 0,
    })
  },
})
export const finishRun = internalMutation({
  args: {
    id: v.id("wofFinanceIntakeRuns"), status: v.string(), checkedEmails: v.number(),
    savedFiles: v.number(), skippedFiles: v.number(), failedFiles: v.number(), reviewFiles: v.number(), error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { id, ...fields } = args
    await ctx.db.patch(id, { ...fields, completedAt: Date.now() })
    return null
  },
})
export const listStatus = internalQuery({
  args: {},
  returns: v.object({
    runs: v.array(v.object({
      id: v.id("wofFinanceIntakeRuns"), startedAt: v.number(), completedAt: v.optional(v.number()),
      status: v.string(), checkedEmails: v.number(), savedFiles: v.number(), skippedFiles: v.number(),
      failedFiles: v.number(), reviewFiles: v.number(), error: v.optional(v.string()), trigger: v.string(),
    })),
    failures: v.array(v.object({
      id: v.id("wofFinanceEmailImports"), fileName: v.string(), sender: v.string(), subject: v.string(),
      error: v.optional(v.string()), updatedAt: v.number(),
    })),
    reviews: v.array(v.object({
      id: v.id("wofFinanceEmailImports"), fileName: v.string(), sender: v.string(), subject: v.string(),
      receivedAt: v.number(), category: v.optional(v.string()), reviewReason: v.optional(v.string()), updatedAt: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const runs = await ctx.db.query("wofFinanceIntakeRuns").withIndex("by_started_at").order("desc").take(8)
    const failures = await ctx.db.query("wofFinanceEmailImports").withIndex("by_status", q => q.eq("status", "CHYBA")).order("desc").take(10)
    const reviews = await ctx.db.query("wofFinanceEmailImports").withIndex("by_status", q => q.eq("status", "NA KONTROLU")).order("desc").take(25)
    return {
      runs: runs.map(({ _id, _creationTime, reviewFiles, ...fields }) => ({ id: _id, ...fields, reviewFiles: reviewFiles ?? 0 })),
      failures: failures.map(({ _id, _creationTime, fileName, sender, subject, error, updatedAt }) => ({ id: _id, fileName, sender, subject, error, updatedAt })),
      reviews: reviews.map(({ _id, _creationTime, fileName, sender, subject, receivedAt, category, reviewReason, updatedAt }) => ({
        id: _id, fileName, sender, subject, receivedAt, category, reviewReason, updatedAt,
      })),
    }
  },
})

async function performSync(ctx: ActionCtx, trigger: string) {
  let checkedEmails = 0, savedFiles = 0, skippedFiles = 0, failedFiles = 0, reviewFiles = 0
  let runId: any
  try {
    runId = await ctx.runMutation(internal.financeIntake.startRun, { trigger })
    if (!runId) return {
      ok: true, message: "Kontrola Gmailu už prebieha.", checkedEmails: 0,
      savedFiles: 0, skippedFiles: 0, failedFiles: 0, reviewFiles: 0,
    }
    const gmailQuery = process.env.WOF_FINANCE_GMAIL_QUERY?.trim() || "label:WOF_FINANCE_INTAKE has:attachment newer_than:30d -in:spam -in:trash"
    let pageToken: string | undefined
    const messages: Row[] = []
    for (let page = 0; page < 5; page += 1) {
      const listed = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GMAIL_FETCH_EMAILS", appName: "GMAIL",
        params: { query: gmailQuery, max_results: 100, verbose: true, include_payload: true, ...(pageToken ? { page_token: pageToken } : {}) },
      })
      if (failed(listed)) throw new Error("WOF Gmail vyhľadávanie zlyhalo.")
      const data = unwrap(listed)
      const items = Array.isArray(data.messages) ? data.messages : []
      messages.push(...items.map(obj))
      pageToken = str(data.nextPageToken ?? data.next_page_token) || undefined
      if (!pageToken) break
    }
    checkedEmails = messages.length
    for (const listedMessage of messages) {
      const messageId = str(listedMessage.messageId ?? listedMessage.id)
      if (!messageId) continue
      const hydrated = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", appName: "GMAIL",
        params: { message_id: messageId, format: "full" },
      })
      if (failed(hydrated)) { failedFiles += 1; continue }
      const envelope = unwrap(hydrated)
      const message = obj(envelope.message ?? envelope)
      const attachments = attachmentsOf(message)
      const header = headersOf(message)
      const receivedAt = timestampOf(message)
      for (const attachment of attachments) {
        if (!validDocument(attachment.fileName, attachment.mimeType)) { skippedFiles += 1; continue }
        const gmailKey = messageId + ":" + attachment.attachmentId
        const existing = await ctx.runQuery(internal.financeIntake.getImportByKey, { gmailKey })
        if (existing?.status === "ULOŽENÉ" || existing?.status === "NA KONTROLU") { skippedFiles += 1; continue }
        const metadata = {
          gmailKey, messageId, attachmentId: attachment.attachmentId, fileName: attachment.fileName,
          sender: header.from ?? str(listedMessage.from), subject: header.subject ?? str(listedMessage.subject), receivedAt,
        }
        try {
          const download = await callMacalyJson("/api/client-app/composio-execute", {
            action: "execute", toolName: "GMAIL_GET_ATTACHMENT", appName: "GMAIL",
            params: { message_id: messageId, attachment_id: attachment.attachmentId, file_name: attachment.fileName },
          })
          if (failed(download)) throw new Error("Prílohu z Gmailu sa nepodarilo stiahnuť.")
          const attachmentFile = obj(unwrap(download).file)
          const sourceUrl = str(attachmentFile.s3url)
          if (!sourceUrl) throw new Error("Gmail nevrátil dočasný odkaz na prílohu.")
          const destinationName = safeName(str(attachmentFile.name) || attachment.fileName, receivedAt, messageId)
          const extracted = await extractDocumentText(
            sourceUrl,
            attachment.fileName,
            str(attachmentFile.mimetype) || attachment.mimeType,
          )
          const routing = routeFinanceDocument({
            fileName: attachment.fileName,
            subject: metadata.subject,
            mimeType: str(attachmentFile.mimetype) || attachment.mimeType,
            text: extracted.text,
          })
          if (!routing.ok || !routing.deliveryDate || !routing.category) {
            await ctx.runMutation(internal.financeIntake.saveImport, {
              ...metadata,
              status: "NA KONTROLU",
              ...(routing.category ? { category: routing.category } : {}),
              reviewReason: extracted.reason || routing.reason || "Doklad vyžaduje manuálnu kontrolu.",
            })
            reviewFiles += 1
            continue
          }
          const destination = await monthlyDestination(routing.deliveryDate, routing.category)
          const routingMetadata = {
            category: routing.category,
            deliveryDate: routing.deliveryDate,
            routingEvidence: routing.evidence,
          }
          const existingDrive = await callMacalyJson("/api/client-app/composio-execute", {
            action: "execute", toolName: "GOOGLEDRIVE_FIND_FILE", appName: "GOOGLEDRIVE",
            params: { folder_id: destination.id, q: "name = '" + destinationName.replace(/'/g, "\\'") + "' and trashed = false", fields: "files(id,name,webViewLink)", pageSize: 5 },
          })
          const matches = Array.isArray(unwrap(existingDrive).files) ? unwrap(existingDrive).files as unknown[] : []
          const prior = obj(matches[0])
          if (str(prior.id)) {
            await ctx.runMutation(internal.financeIntake.saveImport, {
              ...metadata, ...routingMetadata, status: "ULOŽENÉ",
              driveFileId: str(prior.id), driveUrl: str(prior.webViewLink) || destination.url,
            })
            skippedFiles += 1
            continue
          }
          const uploaded = await callMacalyJson("/api/client-app/composio-execute", {
            action: "execute", toolName: "GOOGLEDRIVE_UPLOAD_FROM_URL", appName: "GOOGLEDRIVE",
            params: { source_url: sourceUrl, name: destinationName, mime_type: str(attachmentFile.mimetype) || attachment.mimeType || undefined, parent_folder_id: destination.id },
          })
          if (failed(uploaded)) throw new Error("Prílohu sa nepodarilo uložiť do WOF Drive.")
          const file = unwrap(uploaded)
          await ctx.runMutation(internal.financeIntake.saveImport, {
            ...metadata, ...routingMetadata, status: "ULOŽENÉ", driveFileId: str(file.id), driveUrl: str(file.webViewLink ?? file.display_url) || destination.url,
          })
          savedFiles += 1
        } catch (error) {
          failedFiles += 1
          const messageText = error instanceof Error ? error.message.slice(0, 220) : "Neznáma chyba pri ukladaní prílohy."
          await ctx.runMutation(internal.financeIntake.saveImport, { ...metadata, status: "CHYBA", error: messageText })
        }
      }
    }
    const status = failedFiles
      ? (savedFiles || skippedFiles || reviewFiles ? "ČIASTOČNE" : "CHYBA")
      : reviewFiles ? "NA KONTROLU" : "HOTOVO"
    await ctx.runMutation(internal.financeIntake.finishRun, {
      id: runId, status, checkedEmails, savedFiles, skippedFiles, failedFiles, reviewFiles,
      ...(failedFiles ? { error: failedFiles + " príloh sa nepodarilo uložiť." } : {}),
    })
    const message = failedFiles
      ? "Kontrola skončila s chybami. Pozri podrobnosti vo WOF Finance."
      : reviewFiles
        ? `${reviewFiles} príloh vyžaduje potvrdiť dátum dodania alebo kategóriu.`
        : "Kontrola Gmailu a ukladanie príloh prebehli."
    return { ok: failedFiles === 0, message, checkedEmails, savedFiles, skippedFiles, failedFiles, reviewFiles }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 220) : "Nepodarilo sa vykonať kontrolu WOF Gmailu."
    if (runId) await ctx.runMutation(internal.financeIntake.finishRun, {
      id: runId, status: "CHYBA", checkedEmails, savedFiles, skippedFiles, failedFiles: failedFiles + 1, reviewFiles, error: message,
    })
    console.error("[WOF Finance email intake]", message)
    return { ok: false, message, checkedEmails, savedFiles, skippedFiles, failedFiles: failedFiles + 1, reviewFiles }
  }
}

export const syncEmailAttachments = action({
  args: {},
  returns: RUN_RESULT,
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám.", checkedEmails: 0, savedFiles: 0, skippedFiles: 0, failedFiles: 0, reviewFiles: 0 }
    return performSync(ctx, "MANUÁLNE")
  },
})
export const scheduledEmailAttachmentSync = internalAction({
  args: {},
  returns: RUN_RESULT,
  handler: async (ctx) => {
    if (process.env.WOF_FINANCE_EMAIL_CRON_ENABLED !== "true") {
      return { ok: true, message: "Automatická kontrola Gmailu je vypnutá do ukončenia pilotného testu.", checkedEmails: 0, savedFiles: 0, skippedFiles: 0, failedFiles: 0, reviewFiles: 0 }
    }
    const local = localBratislavaTime()
    if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(local.weekday) || local.hour !== 6 || local.minute < 10 || local.minute > 25) {
      return { ok: true, message: "Toto UTC okno nezodpovedá pracovným dňom 06:15 v Bratislave.", checkedEmails: 0, savedFiles: 0, skippedFiles: 0, failedFiles: 0, reviewFiles: 0 }
    }
    return performSync(ctx, "PLÁNOVANÉ 06:15")
  },
})

export const resolveEmailImport = action({
  args: {
    id: v.id("wofFinanceEmailImports"),
    deliveryDate: v.string(),
    category: CATEGORY_VALIDATOR,
  },
  returns: v.object({ ok: v.boolean(), message: v.string(), driveUrl: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám." }
    const item = await ctx.runQuery(internal.financeIntake.getImportById, { id: args.id })
    if (!item) return { ok: false, message: "Príloha na kontrolu už neexistuje." }
    if (item.status === "ULOŽENÉ") return { ok: true, message: "Príloha už bola uložená.", driveUrl: item.driveUrl }
    try {
      const destination = await monthlyDestination(args.deliveryDate, args.category)
      const download = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GMAIL_GET_ATTACHMENT", appName: "GMAIL",
        params: { message_id: item.messageId, attachment_id: item.attachmentId, file_name: item.fileName },
      })
      if (failed(download)) throw new Error("Prílohu z Gmailu sa nepodarilo znovu načítať.")
      const attachmentFile = obj(unwrap(download).file)
      const sourceUrl = str(attachmentFile.s3url)
      if (!sourceUrl) throw new Error("Gmail nevrátil dočasný odkaz na prílohu.")
      const destinationName = safeName(str(attachmentFile.name) || item.fileName, item.receivedAt, item.messageId)
      const existingDrive = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GOOGLEDRIVE_FIND_FILE", appName: "GOOGLEDRIVE",
        params: { folder_id: destination.id, q: "name = '" + destinationName.replace(/'/g, "\\'") + "' and trashed = false", fields: "files(id,name,webViewLink)", pageSize: 5 },
      })
      const matches = Array.isArray(unwrap(existingDrive).files) ? unwrap(existingDrive).files as unknown[] : []
      const prior = obj(matches[0])
      let driveFileId = str(prior.id)
      let driveUrl = str(prior.webViewLink)
      if (!driveFileId) {
        const uploaded = await callMacalyJson("/api/client-app/composio-execute", {
          action: "execute", toolName: "GOOGLEDRIVE_UPLOAD_FROM_URL", appName: "GOOGLEDRIVE",
          params: {
            source_url: sourceUrl, name: destinationName,
            mime_type: str(attachmentFile.mimetype) || undefined, parent_folder_id: destination.id,
          },
        })
        if (failed(uploaded)) throw new Error("Prílohu sa nepodarilo uložiť do WOF Drive.")
        const file = unwrap(uploaded)
        driveFileId = str(file.id)
        driveUrl = str(file.webViewLink ?? file.display_url)
      }
      await ctx.runMutation(internal.financeIntake.saveImport, {
        gmailKey: item.gmailKey, messageId: item.messageId, attachmentId: item.attachmentId,
        fileName: item.fileName, sender: item.sender, subject: item.subject, receivedAt: item.receivedAt,
        status: "ULOŽENÉ", driveFileId, driveUrl: driveUrl || destination.url,
        category: args.category, deliveryDate: args.deliveryDate,
        routingEvidence: `Manuálne potvrdený dátum dodania: ${args.deliveryDate}`,
      })
      return { ok: true, message: `Príloha bola uložená do ${destination.monthName}/${args.category}.`, driveUrl: driveUrl || destination.url }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 220) : "Prílohu sa nepodarilo manuálne zaradiť."
      return { ok: false, message }
    }
  },
})

export const getEmailIntakeStatus = action({
  args: {},
  returns: v.object({
    runs: v.array(v.object({
      id: v.id("wofFinanceIntakeRuns"), startedAt: v.number(), completedAt: v.optional(v.number()),
      status: v.string(), checkedEmails: v.number(), savedFiles: v.number(), skippedFiles: v.number(),
      failedFiles: v.number(), reviewFiles: v.number(), error: v.optional(v.string()), trigger: v.string(),
    })),
    failures: v.array(v.object({
      id: v.id("wofFinanceEmailImports"), fileName: v.string(), sender: v.string(), subject: v.string(),
      error: v.optional(v.string()), updatedAt: v.number(),
    })),
    reviews: v.array(v.object({
      id: v.id("wofFinanceEmailImports"), fileName: v.string(), sender: v.string(), subject: v.string(),
      receivedAt: v.number(), category: v.optional(v.string()), reviewReason: v.optional(v.string()), updatedAt: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { runs: [], failures: [], reviews: [] }
    return await ctx.runQuery(internal.financeIntake.listStatus, {})
  },
})
