import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { findBestPayableMatch } from "./paymentMatching"

export function paymentMatchIsLocked(status: string): boolean {
  return ["ČAKÁ NA ZÁPIS", "POTVRDENÁ", "ZAMIETNUTÁ"].includes(status)
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
  if (!/\d/.test(compact)) return Number.NaN
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}
function isoDate(value: string): string {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return ""
  const result = match[3] + "-" + match[2] + "-" + match[1]
  const parsed = new Date(result + "T00:00:00Z")
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : ""
}
export function summaryNumber(lines: string[], prefix: string): number {
  const line = lines.find(item => item.toLocaleLowerCase("sk").startsWith(prefix.toLocaleLowerCase("sk")))
  if (!line) return Number.NaN
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
export function parseStatement(text: string): ParsedStatement {
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
  const incomeLine = metadataLines.find(line => line.startsWith("Suma príjmov")) ?? ""
  const expenseLine = metadataLines.find(line => line.startsWith("Suma výdavkov")) ?? ""
  const headerIndex = lines.findIndex(line => csvRow(line)[0]?.replace(/^\uFEFF/, "").trim() === "ID operácie")
  if (headerIndex < 0 || !periodMatch) throw new Error("Výpis nemá rozpoznateľnú hlavičku alebo obdobie.")
  const transactions: ParsedTransaction[] = []
  for (const line of lines.slice(headerIndex + 1).filter(Boolean)) {
    const row = csvRow(line)
    if (row.length < 19 || !row[0].trim()) continue
    const type = row[13].trim()
    let amount = decimal(row[2])
    const normalizedType = type.toLocaleLowerCase("sk")
    if (/príjem|prijem|vratka|prijat/.test(normalizedType)) amount = Math.abs(amount)
    else if (/výdaj|vydaj|odchádz|odchaz|platba/.test(normalizedType)) amount = -Math.abs(amount)
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
  if (!transactions.length) throw new Error("Výpis neobsahuje žiadne transakcie.")
  if (transactions.some(item => !item.bookedOn || !/^[A-Z]{3}$/.test(item.currency) || !Number.isFinite(item.amount))) {
    throw new Error("Niektorá transakcia má neplatný dátum, sumu alebo menu.")
  }
  const operationIds = new Set(transactions.map(item => item.operationId))
  if (operationIds.size !== transactions.length) throw new Error("Výpis obsahuje duplicitné ID operácie.")
  const digits = (accountMatch?.[1] ?? "").replace(/\D/g, "")
  const currencyLine = openingLine || closingLine
  const accountCurrency = currencyLine.match(/\b([A-Z]{3})\s*$/)?.[1] ?? transactions[0]?.currency ?? ""
  if (!digits || !/^[A-Z]{3}$/.test(accountCurrency)) throw new Error("Číslo účtu alebo mena sa vo výpise nedajú rozpoznať.")
  if (transactions.some(item => item.currency !== accountCurrency)) throw new Error("Mena transakcií sa nezhoduje s menou účtu.")
  const periodStart = isoDate(periodMatch[1])
  const periodEnd = isoDate(periodMatch[2])
  if (!periodStart || !periodEnd || periodStart > periodEnd) throw new Error("Obdobie výpisu nie je platné.")
  if (transactions.some(item => item.bookedOn < periodStart || item.bookedOn > periodEnd)) {
    throw new Error("Transakcia je mimo obdobia výpisu.")
  }
  if (!openingLine || !closingLine || !incomeLine || !expenseLine) {
    throw new Error("Výpis nemá všetky povinné súhrnné hodnoty.")
  }
  const openingBalance = summaryNumber(metadataLines, "Začiatočný stav účtu")
  const closingBalance = summaryNumber(metadataLines, "Konečný stav účtu")
  const incomeTotal = Math.abs(summaryNumber(metadataLines, "Suma príjmov"))
  const expenseTotal = Math.abs(summaryNumber(metadataLines, "Suma výdavkov"))
  if (![openingBalance, closingBalance, incomeTotal, expenseTotal].every(Number.isFinite)) {
    throw new Error("Niektorá súhrnná hodnota výpisu nie je platná.")
  }
  if (Math.abs(openingBalance + incomeTotal - expenseTotal - closingBalance) > 0.02) {
    throw new Error("Nesedí počiatočný stav + príjmy - výdavky = konečný stav.")
  }
  return {
    statementNumber: statementMatch?.[1]?.replace(/[^\w/-]/g, "") ?? "",
    accountNumberRaw: digits,
    accountNumberMasked: "•••• " + digits.slice(-4),
    currency: accountCurrency,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    incomeTotal,
    expenseTotal,
    transactions,
  }
}

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
      if (!current || paymentMatchIsLocked(current.matchStatus)) continue
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
      !paymentMatchIsLocked(transaction.matchStatus),
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
    const result = await ctx.runAction(api.financeCommands.markPayablePaidManually, {
      documentIds,
      paymentDate: transaction.bookedOn,
      amount: Math.abs(transaction.amount),
      reference: `Banka: ${transaction.operationId}`,
      note: `Potvrdené párovanie bankovej transakcie. ${transaction.matchReason ?? ""}`.trim(),
      bankTransactionId: transaction._id,
    })
    if (!result.ok) return { ok: false, message: result.message }
    await ctx.runMutation(internal.bankStatements.setMatchStatus, {
      id: args.transactionId, status: "ČAKÁ NA ZÁPIS", payableId: selected.id,
      reason: transaction.matchReason,
    })
    return { ok: true, message: `${result.message} Bankové párovanie sa potvrdí po vykonaní príkazu.` }
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
