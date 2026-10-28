import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { callMacalyJson } from "./macaly"
import { findBestPayableMatch } from "./paymentMatching"

type Row = Record<string, unknown>
const WOF_FINANCE_ROOT_ID = "1vkbIi3cQpyN-xkXG3-As2PCYwJaAz0uS"
const WOF_FINANCE_ROOT_URL = "https://drive.google.com/drive/folders/" + WOF_FINANCE_ROOT_ID
function record(value: unknown): Row {
  return value && typeof value === "object" ? value as Row : {}
}
function str(value: unknown): string {
  return value == null ? "" : String(value).trim()
}
function dataFrom(value: unknown): Row {
  const root = record(value)
  const result = record(root.result)
  return record(result.data ?? root.data ?? result)
}
function isFailure(value: unknown): boolean {
  const root = record(value)
  const result = record(root.result)
  return root.successful === false || result.successful === false
}

async function driveMetadata(fileId: string): Promise<Row> {
  const response = await callMacalyJson("/api/client-app/composio-execute", {
    action: "execute", toolName: "GOOGLEDRIVE_GET_FILE_METADATA", appName: "GOOGLEDRIVE",
    params: { fileId, fields: "id,name,mimeType,parents,trashed,webViewLink,modifiedTime" },
  })
  if (isFailure(response)) throw new Error("WOF Drive metadata lookup failed")
  return dataFrom(response)
}

async function monthlyStatementFiles(): Promise<(Row & { folderId: string })[]> {
  const [csvResponse, pdfResponse] = await Promise.all([
    callMacalyJson("/api/client-app/composio-execute", {
      action: "execute", toolName: "GOOGLEDRIVE_FIND_FILE", appName: "GOOGLEDRIVE",
      params: { q: "name contains '.csv' and trashed = false", fields: "files(id,name,mimeType,webViewLink,modifiedTime,parents),nextPageToken", pageSize: 1000 },
    }),
    callMacalyJson("/api/client-app/composio-execute", {
      action: "execute", toolName: "GOOGLEDRIVE_FIND_FILE", appName: "GOOGLEDRIVE",
      params: { q: "name contains '.pdf' and trashed = false", fields: "files(id,name,mimeType,webViewLink,modifiedTime,parents),nextPageToken", pageSize: 1000 },
    }),
  ])
  if (isFailure(csvResponse) || isFailure(pdfResponse)) throw new Error("WOF Drive file search failed")
  const candidates = [
    ...(Array.isArray(dataFrom(csvResponse).files) ? dataFrom(csvResponse).files as unknown[] : []),
    ...(Array.isArray(dataFrom(pdfResponse).files) ? dataFrom(pdfResponse).files as unknown[] : []),
  ].map(record).filter(file => {
    const name = str(file.name).toLowerCase()
    return name.endsWith(".csv") || name.endsWith(".pdf")
  })

  const metadataCache = new Map<string, Promise<Row>>()
  const metadata = (folderId: string) => {
    if (!metadataCache.has(folderId)) metadataCache.set(folderId, driveMetadata(folderId))
    return metadataCache.get(folderId)!
  }
  const folderIds = [...new Set(candidates.map(file => Array.isArray(file.parents) ? str(file.parents[0]) : "").filter(Boolean))]
  const validFolders = new Set<string>()
  await Promise.all(folderIds.map(async folderId => {
    try {
      const monthFolder = await metadata(folderId)
      if (str(monthFolder.name) !== "Vypisy" || !Array.isArray(monthFolder.parents)) return
      const monthId = str(monthFolder.parents[0])
      if (!monthId) return
      const month = await metadata(monthId)
      if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(str(month.name)) || !Array.isArray(month.parents)) return
      const yearId = str(month.parents[0])
      if (!yearId) return
      const year = await metadata(yearId)
      if (!/^20\d{2}$/.test(str(year.name)) || !Array.isArray(year.parents)) return
      if (year.parents.map(str).includes(WOF_FINANCE_ROOT_ID)) validFolders.add(folderId)
    } catch {
      // Ignore search results outside the WOF monthly archive or inaccessible folders.
    }
  }))
  return candidates
    .filter(file => validFolders.has(Array.isArray(file.parents) ? str(file.parents[0]) : ""))
    .map(file => ({ ...file, folderId: str(Array.isArray(file.parents) ? file.parents[0] : "") }))
}

function csvRow(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ";" && !quoted) {
      fields.push(current)
      current = ""
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}
function decimal(value: string): number {
  const compact = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "")
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
function isoDate(value: string): string {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return match ? match[3] + "-" + match[2] + "-" + match[1] : ""
}
export function summaryNumber(lines: string[], prefix: string): number {
  const line = lines.find(item => item.toLocaleLowerCase("sk").startsWith(prefix.toLocaleLowerCase("sk")))
  if (!line) return 0
  const value = line.split(":").slice(1).join(":")
  const match = value.match(/[-+]?\d[\d\s.,]*/)
  return decimal(match?.[0] ?? "")
}

type ParsedTransaction = {
  operationId: string
  bookedOn: string
  amount: number
  currency: string
  counterpartyAccount: string
  counterpartyName: string
  bankName: string
  constantSymbol: string
  variableSymbol: string
  specificSymbol: string
  note: string
  recipientMessage: string
  transactionType: string
  bic: string
  instructionId: string
}
type ParsedStatement = {
  statementNumber: string
  accountNumberRaw: string
  accountNumberMasked: string
  currency: string
  periodStart: string
  periodEnd: string
  openingBalance: number
  closingBalance: number
  incomeTotal: number
  expenseTotal: number
  transactions: ParsedTransaction[]
}
function parseStatement(text: string): ParsedStatement {
  const source = text.replace(/^\uFEFF/, "").replace(/\r/g, "")
  const lines = source.split("\n")
  const metadataLines = lines.map(line => csvRow(line)[0]?.trim() ?? line.trim())
  const accountLine = metadataLines.find(line => line.includes("z účtu")) ?? ""
  const accountMatch = accountLine.match(/(\d{4,}\/\d{4})/)
  const statementMatch = accountLine.match(/č\.\s*([^ ]+)/i)
  const periodLine = metadataLines.find(line => line.startsWith("Obdobie:")) ?? ""
  const periodMatch = periodLine.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/)
  const openingLine = metadataLines.find(line => line.startsWith("Začiatočný stav účtu")) ?? ""
  const closingLine = metadataLines.find(line => line.startsWith("Konečný stav účtu")) ?? ""
  const headerIndex = lines.findIndex(line => csvRow(line)[0]?.replace(/^\uFEFF/, "").trim() === "ID operácie")
  if (headerIndex < 0 || !periodMatch) throw new Error("Výpis nemá rozpoznateľnú hlavičku alebo obdobie.")
  const transactions: ParsedTransaction[] = []
  for (const line of lines.slice(headerIndex + 1).filter(Boolean)) {
    const row = csvRow(line)
    if (row.length < 19 || !row[0].trim()) continue
    const type = row[13].trim()
    let amount = decimal(row[2])
    const normalizedType = type.toLocaleLowerCase("sk")
    if (/výdaj|vydaj|odchádz|odchaz|platba/.test(normalizedType)) amount = -Math.abs(amount)
    else if (/príjem|prijem|vratka/.test(normalizedType)) amount = Math.abs(amount)
    transactions.push({
      operationId: row[0].trim(),
      bookedOn: isoDate(row[1].trim()),
      amount,
      currency: row[3].trim().toUpperCase(),
      counterpartyAccount: row[4].trim(),
      counterpartyName: row[5].trim(),
      bankName: row[7].trim(),
      constantSymbol: row[8].trim(),
      variableSymbol: row[9].trim(),
      specificSymbol: row[10].trim(),
      note: row[11].trim(),
      recipientMessage: row[12].trim(),
      transactionType: type,
      bic: row[17].trim(),
      instructionId: row[18].trim(),
    })
  }
  if (transactions.some(item => !item.bookedOn || !item.currency || !Number.isFinite(item.amount))) {
    throw new Error("Niektorá transakcia má neplatný dátum, sumu alebo menu.")
  }
  const digits = (accountMatch?.[1] ?? "").replace(/\D/g, "")
  const currencyLine = openingLine || closingLine
  const accountCurrency = currencyLine.match(/\b([A-Z]{3})\s*$/)?.[1] ?? transactions[0]?.currency ?? ""
  if (!digits || !accountCurrency) throw new Error("Číslo účtu alebo mena sa vo výpise nedajú rozpoznať.")
  if (transactions.some(item => item.currency !== accountCurrency)) throw new Error("Mena transakcií sa nezhoduje s menou účtu.")
  return {
    statementNumber: statementMatch?.[1]?.replace(/[^\w/-]/g, "") ?? "",
    accountNumberRaw: digits,
    accountNumberMasked: "•••• " + digits.slice(-4),
    currency: accountCurrency,
    periodStart: isoDate(periodMatch[1]),
    periodEnd: isoDate(periodMatch[2]),
    openingBalance: summaryNumber(metadataLines, "Začiatočný stav účtu"),
    closingBalance: summaryNumber(metadataLines, "Konečný stav účtu"),
    incomeTotal: summaryNumber(metadataLines, "Suma príjmov"),
    expenseTotal: summaryNumber(metadataLines, "Suma výdavkov"),
    transactions,
  }
}

const driveFileValidator = v.object({
  id: v.string(),
  name: v.string(),
  mimeType: v.string(),
  modifiedTime: v.string(),
  webViewLink: v.string(),
  pairedPdfId: v.optional(v.string()),
  pairedPdfName: v.optional(v.string()),
})
const transactionValidator = v.object({
  operationId: v.string(),
  bookedOn: v.string(),
  amount: v.number(),
  currency: v.string(),
  counterpartyAccount: v.string(),
  counterpartyName: v.string(),
  bankName: v.string(),
  constantSymbol: v.string(),
  variableSymbol: v.string(),
  specificSymbol: v.string(),
  note: v.string(),
  recipientMessage: v.string(),
  transactionType: v.string(),
  bic: v.string(),
  instructionId: v.string(),
})
const statementValidator = v.object({
  id: v.id("bankStatements"),
  sourceFileId: v.string(),
  sourceFileName: v.string(),
  sourceFileUrl: v.string(),
  pdfFileId: v.optional(v.string()),
  pdfFileName: v.optional(v.string()),
  accountKey: v.string(),
  accountLabel: v.string(),
  currency: v.string(),
  accountNumberMasked: v.string(),
  statementNumber: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  openingBalance: v.number(),
  closingBalance: v.number(),
  incomeTotal: v.number(),
  expenseTotal: v.number(),
  transactionCount: v.number(),
  duplicateCount: v.number(),
  importedAt: v.number(),
  status: v.string(),
})
const statementTransactionValidator = v.object({
  id: v.id("bankTransactions"),
  statementId: v.id("bankStatements"),
  accountKey: v.string(),
  operationId: v.string(),
  bookedOn: v.string(),
  amount: v.number(),
  currency: v.string(),
  counterpartyAccount: v.string(),
  counterpartyName: v.string(),
  bankName: v.string(),
  constantSymbol: v.string(),
  variableSymbol: v.string(),
  specificSymbol: v.string(),
  note: v.string(),
  recipientMessage: v.string(),
  transactionType: v.string(),
  bic: v.string(),
  instructionId: v.string(),
  matchStatus: v.string(),
  matchedPayableId: v.string(),
  matchScore: v.optional(v.number()),
  matchReason: v.optional(v.string()),
})

export const getBankStatementBySource = internalQuery({
  args: { sourceFileId: v.string(), accountKey: v.optional(v.string()) },
  returns: v.union(statementValidator, v.null()),
  handler: async (ctx, args) => {
    const found = await ctx.db.query("bankStatements")
      .withIndex("by_source_file", q => q.eq("sourceFileId", args.sourceFileId))
      .unique()
    if (!found) return null
    const legacyCurrency = args.accountKey?.split("_")[0]
    if (legacyCurrency && legacyCurrency !== found.currency) return null
    const { _id, _creationTime, ...fields } = found
    return { id: _id, ...fields }
  },
})
export const createBankStatement = internalMutation({
  args: {
    sourceFileId: v.string(), sourceFileName: v.string(), sourceFileUrl: v.string(),
    pdfFileId: v.optional(v.string()), pdfFileName: v.optional(v.string()),
    accountKey: v.string(), accountLabel: v.string(), currency: v.string(),
    accountNumberMasked: v.string(), statementNumber: v.string(),
    periodStart: v.string(), periodEnd: v.string(), openingBalance: v.number(),
    closingBalance: v.number(), incomeTotal: v.number(), expenseTotal: v.number(),
  },
  returns: v.object({ id: v.id("bankStatements"), alreadyImported: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("bankStatements")
      .withIndex("by_source_file", q => q.eq("sourceFileId", args.sourceFileId))
      .unique()
    if (existing) return { id: existing._id, alreadyImported: true }
    const id = await ctx.db.insert("bankStatements", {
      ...args, transactionCount: 0, duplicateCount: 0, importedAt: Date.now(), status: "SPRACÚVA SA",
    })
    return { id, alreadyImported: false }
  },
})
export const addBankTransactionBatch = internalMutation({
  args: { statementId: v.id("bankStatements"), accountKey: v.string(), rows: v.array(v.any()) },
  returns: v.object({ inserted: v.number(), duplicates: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0
    let duplicates = 0
    for (const row of args.rows as ParsedTransaction[]) {
      const existing = await ctx.db.query("bankTransactions")
        .withIndex("by_account_operation", q => q.eq("accountKey", args.accountKey).eq("operationId", row.operationId))
        .unique()
      if (existing) { duplicates += 1; continue }
      await ctx.db.insert("bankTransactions", {
        ...row, statementId: args.statementId, accountKey: args.accountKey,
        matchStatus: "NEPRIRADENÁ", matchedPayableId: "",
      })
      inserted += 1
    }
    return { inserted, duplicates }
  },
})
export const finishBankStatement = internalMutation({
  args: { statementId: v.id("bankStatements"), transactionCount: v.number(), duplicateCount: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.statementId, {
      transactionCount: args.transactionCount, duplicateCount: args.duplicateCount, status: "NAČÍTANÝ",
    })
    return null
  },
})

export const importBankStatementFromN8n = internalAction({
  args: {
    sourceFileId: v.string(),
    sourceFileName: v.string(),
    sourceFileUrl: v.string(),
    csvText: v.string(),
    pdfFileId: v.optional(v.string()),
    pdfFileName: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(), code: v.string(), message: v.string(),
    statementId: v.optional(v.id("bankStatements")), transactionCount: v.number(),
    duplicateCount: v.number(), currency: v.string(), period: v.string(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(internal.bankStatements.getBankStatementBySource, {
      sourceFileId: args.sourceFileId,
    })
    if (existing) return {
      ok: true, code: "ALREADY_IMPORTED", message: "Tento CSV výpis už bol importovaný.",
      statementId: existing.id, transactionCount: existing.transactionCount,
      duplicateCount: existing.duplicateCount, currency: existing.currency,
      period: existing.periodStart.slice(0, 7),
    }
    const parsed = parseStatement(args.csvText)
    const accountDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.accountNumberRaw))
    const accountKey = parsed.currency + "_" + Array.from(new Uint8Array(accountDigest)).slice(0, 10)
      .map(byte => byte.toString(16).padStart(2, "0")).join("")
    const statementResult = await ctx.runMutation(internal.bankStatements.createBankStatement, {
      sourceFileId: args.sourceFileId, sourceFileName: args.sourceFileName,
      sourceFileUrl: args.sourceFileUrl, pdfFileId: args.pdfFileId, pdfFileName: args.pdfFileName,
      accountKey, accountLabel: parsed.currency + " účet · " + parsed.accountNumberMasked,
      currency: parsed.currency, accountNumberMasked: parsed.accountNumberMasked,
      statementNumber: parsed.statementNumber, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd,
      openingBalance: parsed.openingBalance, closingBalance: parsed.closingBalance,
      incomeTotal: parsed.incomeTotal, expenseTotal: parsed.expenseTotal,
    })
    if (statementResult.alreadyImported) return {
      ok: true, code: "ALREADY_IMPORTED", message: "Tento CSV výpis už bol importovaný.",
      statementId: statementResult.id, transactionCount: 0, duplicateCount: 0,
      currency: parsed.currency, period: parsed.periodStart.slice(0, 7),
    }
    let inserted = 0
    let duplicates = 0
    for (let offset = 0; offset < parsed.transactions.length; offset += 100) {
      const result = await ctx.runMutation(internal.bankStatements.addBankTransactionBatch, {
        statementId: statementResult.id, accountKey, rows: parsed.transactions.slice(offset, offset + 100),
      })
      inserted += result.inserted
      duplicates += result.duplicates
    }
    await ctx.runMutation(internal.bankStatements.finishBankStatement, {
      statementId: statementResult.id, transactionCount: inserted, duplicateCount: duplicates,
    })
    return {
      ok: true, code: "IMPORTED", message: "Výpis " + parsed.periodStart.slice(0, 7) + " importovaný.",
      statementId: statementResult.id, transactionCount: inserted, duplicateCount: duplicates,
      currency: parsed.currency, period: parsed.periodStart.slice(0, 7),
    }
  },
})
export const listStatementRows = internalQuery({
  args: {},
  returns: v.object({
    statements: v.array(statementValidator),
    transactions: v.array(statementTransactionValidator),
  }),
  handler: async (ctx) => {
    const statementDocs = await ctx.db.query("bankStatements").withIndex("by_imported_at").order("desc").take(50)
    const transactionDocs = await ctx.db.query("bankTransactions").withIndex("by_booked_on").order("desc").take(250)
    const statements = statementDocs.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields }))
    const transactions = transactionDocs.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields }))
    return { statements, transactions }
  },
})

export const getTransactionById = internalQuery({
  args: { id: v.id("bankTransactions") },
  returns: v.union(statementTransactionValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (!row) return null
    const { _id, _creationTime, ...fields } = row
    return { id: _id, ...fields }
  },
})

export const setMatchProposals = internalMutation({
  args: {
    evaluatedIds: v.array(v.id("bankTransactions")),
    proposals: v.array(v.object({
      transactionId: v.id("bankTransactions"), payableId: v.string(), score: v.number(), reason: v.string(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const proposals = new Map(args.proposals.map(proposal => [proposal.transactionId, proposal]))
    for (const id of args.evaluatedIds) {
      const current = await ctx.db.get(id)
      if (!current || ["POTVRDENÁ", "ZAMIETNUTÁ"].includes(current.matchStatus)) continue
      const proposal = proposals.get(id)
      if (proposal) {
        await ctx.db.patch(id, {
          matchStatus: "NAVRHNUTÁ", matchedPayableId: proposal.payableId,
          matchScore: proposal.score, matchReason: proposal.reason,
        })
      } else {
        await ctx.db.patch(id, {
          matchStatus: "NEPRIRADENÁ", matchedPayableId: "", matchScore: undefined, matchReason: undefined,
        })
      }
    }
    return null
  },
})

export const setMatchStatus = internalMutation({
  args: {
    id: v.id("bankTransactions"), status: v.string(), payableId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.id, {
      matchStatus: args.status,
      matchedPayableId: args.payableId ?? "",
      matchReason: args.reason,
    })
    return null
  },
})

export const listDriveStatementFiles = action({
  args: {},
  returns: v.object({
    ok: v.boolean(), message: v.string(), folderUrl: v.string(), files: v.array(driveFileValidator),
  }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám.", folderUrl: WOF_FINANCE_ROOT_URL, files: [] }
    try {
      const allFiles = await monthlyStatementFiles()
      const csvs = allFiles.filter(file => str(file.name).toLowerCase().endsWith(".csv"))
      const pdfs = allFiles.filter(file => str(file.name).toLowerCase().endsWith(".pdf"))
      return {
        ok: true,
        message: csvs.length ? "Našiel som CSV výpisy v mesačných priečinkoch Vypisy." : "V mesačných priečinkoch Vypisy zatiaľ nie je CSV výpis.",
        folderUrl: WOF_FINANCE_ROOT_URL,
        files: csvs.map(csv => {
          const stem = str(csv.name).replace(/\.csv$/i, "").toLocaleLowerCase("sk")
          const pdf = pdfs.find(item => item.folderId === csv.folderId && str(item.name).replace(/\.pdf$/i, "").toLocaleLowerCase("sk") === stem)
          return {
            id: str(csv.id), name: str(csv.name), mimeType: str(csv.mimeType),
            modifiedTime: str(csv.modifiedTime), webViewLink: str(csv.webViewLink) || WOF_FINANCE_ROOT_URL,
            pairedPdfId: pdf ? str(pdf.id) : undefined,
            pairedPdfName: pdf ? str(pdf.name) : undefined,
          }
        }),
      }
    } catch (error) {
      console.error("[WOF bank statement] Monthly Drive scan failed", error)
      return { ok: false, message: "Mesačné priečinky s výpismi sa nepodarilo načítať. Skontroluj pripojenie WOF Drive.", folderUrl: WOF_FINANCE_ROOT_URL, files: [] }
    }
  },
})

function extractedCsv(response: unknown): Promise<string> | string {
  const root = record(response)
  const result = record(root.result)
  const data = dataFrom(response)
  const downloaded = record(data.downloaded_file_content ?? result.downloaded_file_content ?? root.downloaded_file_content)
  const inline = downloaded.content ?? downloaded.text ?? downloaded.data
  if (typeof inline === "string" && inline.length > 20) return inline
  const base64 = downloaded.base64 ?? downloaded.content_base64
  if (typeof base64 === "string") {
    const binary = atob(base64)
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
  }
  const url = str(downloaded.s3url ?? downloaded.url ?? downloaded.download_url)
  if (url) return fetch(url).then(async res => {
    if (!res.ok) throw new Error("Drive file download failed")
    return res.text()
  })
  throw new Error("Drive nevrátil obsah CSV súboru.")
}

export const listBankStatements = action({
  args: {},
  returns: v.object({ statements: v.array(statementValidator), transactions: v.array(statementTransactionValidator) }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { statements: [], transactions: [] }
    return await ctx.runQuery(internal.bankStatements.listStatementRows, {})
  },
})

export const proposePaymentMatches = action({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string(), evaluated: v.number(), proposed: v.number() }),
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám.", evaluated: 0, proposed: 0 }
    const [payableResult, statementRows] = await Promise.all([
      ctx.runAction(api.wofFinance.listPayables, { force: true }),
      ctx.runQuery(internal.bankStatements.listStatementRows, {}),
    ])
    if (!payableResult.ok) return { ok: false, message: payableResult.message, evaluated: 0, proposed: 0 }
    const candidates = statementRows.transactions.filter(transaction =>
      !["POTVRDENÁ", "ZAMIETNUTÁ"].includes(transaction.matchStatus),
    )
    const proposals = candidates.flatMap(transaction => {
      const match = findBestPayableMatch({
        id: String(transaction.id), amount: transaction.amount, currency: transaction.currency,
        bookedOn: transaction.bookedOn, counterpartyName: transaction.counterpartyName,
        variableSymbol: transaction.variableSymbol, note: transaction.note,
        recipientMessage: transaction.recipientMessage,
      }, payableResult.rows)
      return match ? [{
        transactionId: transaction.id,
        payableId: match.payableId,
        score: match.score,
        reason: match.reason,
      }] : []
    })
    await ctx.runMutation(internal.bankStatements.setMatchProposals, {
      evaluatedIds: candidates.map(transaction => transaction.id), proposals,
    })
    return {
      ok: true,
      message: proposals.length
        ? `${proposals.length} bezpečných návrhov čaká na potvrdenie.`
        : "Nenašla sa jednoznačná zhoda. Žiadna platba nebola označená ako uhradená.",
      evaluated: candidates.length,
      proposed: proposals.length,
    }
  },
})

export const confirmPaymentMatch = action({
  args: { transactionId: v.id("bankTransactions") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám." }
    const transaction = await ctx.runQuery(internal.bankStatements.getTransactionById, { id: args.transactionId })
    if (!transaction || !transaction.matchedPayableId || transaction.matchStatus !== "NAVRHNUTÁ") {
      return { ok: false, message: "Návrh párovania už nie je aktuálny." }
    }
    if (transaction.amount >= 0) return { ok: false, message: "Príjmovú transakciu nemožno priradiť k záväzku." }
    const payableResult = await ctx.runAction(api.wofFinance.listPayables, { force: true })
    if (!payableResult.ok) return { ok: false, message: payableResult.message }
    const selected = payableResult.rows.find(row => row.id === transaction.matchedPayableId)
    if (!selected) return { ok: false, message: "Navrhnutý doklad už v registri nie je." }
    const normalizedAmount = selected.amount.replace(/\s/g, "").replace(",", ".")
    const documentIds = payableResult.rows.filter(row =>
      row.supplier === selected.supplier && row.invoiceNumber === selected.invoiceNumber &&
      row.currency === selected.currency && row.amount.replace(/\s/g, "").replace(",", ".") === normalizedAmount,
    ).map(row => row.id)
    const result = await ctx.runAction(api.wofFinance.markPayablePaidManually, {
      documentIds,
      paymentDate: transaction.bookedOn,
      amount: Math.abs(transaction.amount),
      reference: `Banka: ${transaction.operationId}`,
      note: `Potvrdené párovanie bankovej transakcie. ${transaction.matchReason ?? ""}`.trim(),
    })
    if (!result.ok) return { ok: false, message: result.message }
    await ctx.runMutation(internal.bankStatements.setMatchStatus, {
      id: args.transactionId, status: "POTVRDENÁ", payableId: selected.id,
      reason: transaction.matchReason,
    })
    return { ok: true, message: result.message }
  },
})

export const rejectPaymentMatch = action({
  args: { transactionId: v.id("bankTransactions") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám." }
    const transaction = await ctx.runQuery(internal.bankStatements.getTransactionById, { id: args.transactionId })
    if (!transaction || transaction.matchStatus !== "NAVRHNUTÁ") return { ok: false, message: "Návrh už nie je aktuálny." }
    await ctx.runMutation(internal.bankStatements.setMatchStatus, {
      id: args.transactionId, status: "ZAMIETNUTÁ", reason: "Návrh zamietnutý používateľom.",
    })
    return { ok: true, message: "Návrh bol zamietnutý; register zostal nezmenený." }
  },
})

export const importBankStatementCsv = action({
  args: { fileId: v.string(), accountKey: v.optional(v.string()), pdfFileId: v.optional(v.string()), pdfFileName: v.optional(v.string()) },
  returns: v.object({
    ok: v.boolean(), code: v.string(), message: v.string(), statementId: v.optional(v.id("bankStatements")),
    transactionCount: v.number(), duplicateCount: v.number(), currency: v.string(), period: v.string(),
  }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k WOF financiám.", transactionCount: 0, duplicateCount: 0, currency: "", period: "" }
    if (args.accountKey && !/^(EUR_[12]|USD|CZK)$/.test(args.accountKey)) {
      return { ok: false, code: "INVALID_ACCOUNT_HINT", message: "Zadaný účet výpisu nie je rozpoznaný.", transactionCount: 0, duplicateCount: 0, currency: "", period: "" }
    }
    try {
      const sourceFiles = await monthlyStatementFiles()
      const source = sourceFiles.find(file => str(file.id) === args.fileId && str(file.name).toLowerCase().endsWith(".csv"))
      if (!source) return { ok: false, code: "FILE_NOT_IN_FOLDER", message: "CSV sa nenašlo v mesačnom priečinku WOF Finance/Vypisy.", transactionCount: 0, duplicateCount: 0, currency: "", period: "" }
      if (args.pdfFileId && !sourceFiles.some(file => str(file.id) === args.pdfFileId && str(file.name).toLowerCase().endsWith(".pdf") && file.folderId === source.folderId)) {
        return { ok: false, code: "PDF_NOT_IN_FOLDER", message: "Priradené PDF sa v rovnakom mesačnom priečinku Vypisy nenašlo.", transactionCount: 0, duplicateCount: 0, currency: "", period: "" }
      }
      const existing = await ctx.runQuery(internal.bankStatements.getBankStatementBySource, { sourceFileId: args.fileId, accountKey: args.accountKey })
      if (existing) {
        return { ok: true, code: "ALREADY_IMPORTED", message: "Tento CSV výpis už bol importovaný.", statementId: existing.id, transactionCount: existing.transactionCount, duplicateCount: existing.duplicateCount, currency: existing.currency, period: existing.periodStart.slice(0, 7) }
      }
      const downloaded = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute", toolName: "GOOGLEDRIVE_DOWNLOAD_FILE", appName: "GOOGLEDRIVE",
        params: { fileId: args.fileId },
      })
      if (isFailure(downloaded)) throw new Error("Download failed")
      const csvText = await extractedCsv(downloaded)
      const parsed = parseStatement(csvText)
      const accountDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.accountNumberRaw))
      if (args.accountKey && args.accountKey.split("_")[0] !== parsed.currency) {
        return { ok: false, code: "CURRENCY_MISMATCH", message: "Mena v CSV sa nezhoduje s účtom uvedeným pri tomto importe.", transactionCount: 0, duplicateCount: 0, currency: parsed.currency, period: parsed.periodStart.slice(0, 7) }
      }
      const accountKey = parsed.currency + "_" + Array.from(new Uint8Array(accountDigest)).slice(0, 10).map(byte => byte.toString(16).padStart(2, "0")).join("")
      const statementResult = await ctx.runMutation(internal.bankStatements.createBankStatement, {
        sourceFileId: args.fileId, sourceFileName: str(source.name),
        sourceFileUrl: str(source.webViewLink) || WOF_FINANCE_ROOT_URL,
        pdfFileId: args.pdfFileId, pdfFileName: args.pdfFileName,
        accountKey, accountLabel: parsed.currency + " účet · " + parsed.accountNumberMasked, currency: parsed.currency,
        accountNumberMasked: parsed.accountNumberMasked, statementNumber: parsed.statementNumber,
        periodStart: parsed.periodStart, periodEnd: parsed.periodEnd,
        openingBalance: parsed.openingBalance, closingBalance: parsed.closingBalance,
        incomeTotal: parsed.incomeTotal, expenseTotal: parsed.expenseTotal,
      })
      if (statementResult.alreadyImported) return { ok: true, code: "ALREADY_IMPORTED", message: "Tento výpis už bol importovaný.", statementId: statementResult.id, transactionCount: 0, duplicateCount: 0, currency: parsed.currency, period: parsed.periodStart.slice(0, 7) }
      let inserted = 0
      let duplicates = 0
      for (let offset = 0; offset < parsed.transactions.length; offset += 100) {
        const result = await ctx.runMutation(internal.bankStatements.addBankTransactionBatch, {
          statementId: statementResult.id, accountKey, rows: parsed.transactions.slice(offset, offset + 100),
        })
        inserted += result.inserted
        duplicates += result.duplicates
      }
      await ctx.runMutation(internal.bankStatements.finishBankStatement, {
        statementId: statementResult.id, transactionCount: inserted, duplicateCount: duplicates,
      })
      return {
        ok: true, code: "IMPORTED",
        message: "Výpis " + parsed.periodStart.slice(0, 7) + " importovaný.",
        statementId: statementResult.id, transactionCount: inserted, duplicateCount: duplicates,
        currency: parsed.currency, period: parsed.periodStart.slice(0, 7),
      }
    } catch (error) {
      console.error("[WOF bank statement] Import failed", error)
      return { ok: false, code: "IMPORT_FAILED", message: "CSV sa nepodarilo bezpečne importovať. Skontroluj formát súboru alebo skús obnoviť zoznam.", transactionCount: 0, duplicateCount: 0, currency: "", period: "" }
    }
  },
})
