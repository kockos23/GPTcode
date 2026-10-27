import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { callMacalyJson } from "./macaly"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {}
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim()
}

function isCardOrRecurringPayment(method: string): boolean {
  return ["platobná karta", "trvalý príkaz / paušál"].includes(method.trim().toLocaleLowerCase("sk"))
}

function numericAmount(value: unknown): number {
  const compact = text(value).replace(/\s/g, "")
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const PAYABLE_CACHE_TTL_MS = 15 * 60 * 1000

function rowsFromResponse(value: unknown): unknown[][] {
  const root = record(value)
  const result = record(root.result)
  const data = record(result.data ?? root.data ?? root)
  if (Array.isArray(data.values)) return data.values.filter(Array.isArray) as unknown[][]
  const ranges = Array.isArray(data.valueRanges) ? data.valueRanges : []
  const first = record(ranges[0])
  return Array.isArray(first.values) ? first.values.filter(Array.isArray) as unknown[][] : []
}

function payableRowsFromSource(sourceRows: unknown[][]) {
  return sourceRows.slice(1).filter(row => text(row[0])).map(row => ({
    id: text(row[0]),
    kind: text(row[3]),
    documentStatus: text(row[4]),
    supplier: text(row[9]),
    invoiceNumber: text(row[13]),
    dueDate: text(row[8]),
    amount: text(row[18]),
    currency: text(row[15]),
    paymentMethod: text(row[19]),
    paymentStatus: isCardOrRecurringPayment(text(row[19])) ? "Uhradené" : text(row[20]) || "Neoverené",
    transactionId: text(row[21]),
    fileUrl: text(row[23]),
    note: text(row[31]),
    paidAmount: text(row[35]) || (
      isCardOrRecurringPayment(text(row[19])) ||
      ["uhradené", "uhradene", "paid", "zaplatené", "zaplatene"].includes(text(row[20]).toLocaleLowerCase("sk"))
        ? text(row[18])
        : ""
    ),
    paymentHistory: text(row[36]),
  }))
}

const payableValidator = v.object({
  id: v.string(),
  kind: v.string(),
  documentStatus: v.string(),
  supplier: v.string(),
  invoiceNumber: v.string(),
  dueDate: v.string(),
  amount: v.string(),
  currency: v.string(),
  paymentMethod: v.string(),
  paymentStatus: v.string(),
  transactionId: v.string(),
  fileUrl: v.string(),
  note: v.string(),
  paidAmount: v.optional(v.string()),
  paymentHistory: v.optional(v.string()),
})

export const getPayablesCache = internalQuery({
  args: {},
  returns: v.union(
    v.object({ rows: v.array(payableValidator), updatedAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx) => {
    const cached = await ctx.db.query("wofFinanceCache")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "payables"))
      .unique()
    return cached ? { rows: cached.rows, updatedAt: cached.updatedAt } : null
  },
})

export const setPayablesCache = internalMutation({
  args: { rows: v.array(payableValidator), updatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const cached = await ctx.db.query("wofFinanceCache")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "payables"))
      .unique()
    if (cached) {
      await ctx.db.patch(cached._id, { rows: args.rows, updatedAt: args.updatedAt })
    } else {
      await ctx.db.insert("wofFinanceCache", { cacheKey: "payables", rows: args.rows, updatedAt: args.updatedAt })
    }
    return null
  },
})

export const listPayables = action({
  args: { force: v.optional(v.boolean()) },
  returns: v.object({
    ok: v.boolean(),
    code: v.string(),
    message: v.string(),
    updatedAt: v.number(),
    rows: v.array(payableValidator),
  }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) {
      return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k WOF financiám.", updatedAt: 0, rows: [] }
    }

    const cached = await ctx.runQuery(internal.wofFinance.getPayablesCache, {})
    if (!args.force && cached && Date.now() - cached.updatedAt < PAYABLE_CACHE_TTL_MS) {
      return { ok: true, code: "CACHE", message: "Používam posledný synchronizovaný stav.", updatedAt: cached.updatedAt, rows: cached.rows }
    }
    const cachedFallback = async (message: string) => {
      const latest = await ctx.runQuery(internal.wofFinance.getPayablesCache, {})
      if (latest) return { ok: true, code: "STALE_CACHE", message, updatedAt: latest.updatedAt, rows: latest.rows }
      return { ok: false, code: "SOURCE_ERROR", message, updatedAt: Date.now(), rows: [] }
    }

    try {
      const response = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute",
        toolName: "GOOGLESHEETS_VALUES_GET",
        appName: "GOOGLESHEETS",
        params: {
          spreadsheet_id: "1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8",
          range: "'Doklady'!A1:AK1000",
          major_dimension: "ROWS",
          value_render_option: "FORMATTED_VALUE",
        },
      })
      const root = record(response)
      const result = record(root.result)
      if (result.successful === false || root.successful === false) {
        const detail = text(result.error ?? root.error).slice(0, 180)
        console.error("[WOF Finance] Sheets read rejected", { detail })
        return await cachedFallback("Zdroj WOF dočasne obmedzil obnovenie. Zobrazené sú posledné uložené dáta; skús obnoviť neskôr.")
      }
      const sourceRows = rowsFromResponse(response)
      if (!sourceRows.length || text(sourceRows[0][0]) !== "Doklad ID") {
        return await cachedFallback("Štruktúra WOF registra sa nezhoduje. Zobrazený je posledný úspešný stav.")
      }
      const rows = payableRowsFromSource(sourceRows)
      const updatedAt = Date.now()
      try {
        await ctx.runMutation(internal.wofFinance.setPayablesCache, { rows, updatedAt })
      } catch (cacheError) {
        console.error("[WOF Finance] Cache update failed", { detail: cacheError instanceof Error ? cacheError.message.slice(0, 120) : "unknown" })
      }
      return { ok: true, code: "OK", message: "WOF register načítaný.", updatedAt, rows }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error("[WOF Finance] Sheets request failed", { detail: detail.slice(0, 180) })
      return await cachedFallback(`Google Sheets dočasne obmedzil čítanie. Zobrazený je posledný úspešný stav.`)
    }
  },
})

export const addManualPayable = action({
  args: {
    supplier: v.string(),
    purpose: v.string(),
    dueDate: v.string(),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: v.string(),
    invoiceDate: v.optional(v.string()),
    deliveryDate: v.string(),
    invoiceNumber: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), message: v.string(), id: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) {
      return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k zápisu do WOF financií.", id: "" }
    }

    const supplier = args.supplier.trim()
    const purpose = args.purpose.trim()
    const currency = args.currency.trim().toUpperCase()
    const paymentMethod = args.paymentMethod.trim()
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!supplier || supplier.length > 200 || !purpose || purpose.length > 500) {
      return { ok: false, code: "INVALID_INPUT", message: "Doplň dodávateľa a stručný účel záväzku.", id: "" }
    }
    if (!datePattern.test(args.dueDate) || !datePattern.test(args.deliveryDate) || (args.invoiceDate && !datePattern.test(args.invoiceDate))) {
      return { ok: false, code: "INVALID_DATE", message: "Dátum zadaj v platnom formáte.", id: "" }
    }
    if (!Number.isFinite(args.amount) || args.amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, code: "INVALID_AMOUNT", message: "Skontroluj sumu a trojpísmenový kód meny.", id: "" }
    }
    if (!["Bankový prevod", "Platobná karta", "Trvalý príkaz / paušál", "Hotovosť", "Iné"].includes(paymentMethod)) {
      return { ok: false, code: "INVALID_METHOD", message: "Vyber spôsob úhrady zo zoznamu.", id: "" }
    }

    try {
      const response = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute",
        toolName: "GOOGLESHEETS_VALUES_GET",
        appName: "GOOGLESHEETS",
        params: {
          spreadsheet_id: "1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8",
          range: "'Doklady'!A1:AK1000",
          major_dimension: "ROWS",
          value_render_option: "FORMATTED_VALUE",
        },
      })
      const sourceRows = rowsFromResponse(response)
      if (!sourceRows.length || text(sourceRows[0][0]) !== "Doklad ID") {
        return { ok: false, code: "SOURCE_ERROR", message: "WOF register nie je dostupný alebo má inú štruktúru.", id: "" }
      }
      if (sourceRows.length >= 1000) {
        return { ok: false, code: "ROW_LIMIT", message: "Register dosiahol bezpečný limit načítania. Zápis som nevykonal.", id: "" }
      }

      const id = "WOF-M-" + Date.now().toString(36).toUpperCase()
      const receivedAt = new Date().toISOString()
      const period = args.deliveryDate.slice(0, 7)
      const values: (string | number)[] = [
        id, "WOF", period, "Ručný záväzok", "Na kontrolu", receivedAt,
        args.invoiceDate ?? "", args.deliveryDate, args.dueDate, supplier, "", "", "",
        args.invoiceNumber?.trim() ?? "", "", currency, "", "", args.amount,
        paymentMethod, isCardOrRecurringPayment(paymentMethod) ? "Uhradené" : "Neoverené", "", "", "", "", "dashboard", "",
        "Ručne zadané v dashboarde", "", "", "", purpose, "MANUAL", "dashboard-v1",
      ]
      const rowNumber = sourceRows.length + 1
      const writeResponse = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute",
        toolName: "GOOGLESHEETS_VALUES_UPDATE",
        appName: "GOOGLESHEETS",
        params: {
          spreadsheet_id: "1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8",
          range: `'Doklady'!A${rowNumber}:AH${rowNumber}`,
          value_input_option: "RAW",
          major_dimension: "ROWS",
          include_values_in_response: true,
          values: [values],
        },
      })
      const writeResult = record(record(writeResponse).result)
      if (writeResult.successful === false) {
        return { ok: false, code: "WRITE_FAILED", message: "Zápis do registra zlyhal. Obnov prehľad a skontroluj register.", id: "" }
      }
      const updatedAt = Date.now()
      try {
        await ctx.runMutation(internal.wofFinance.setPayablesCache, { rows: payableRowsFromSource([...sourceRows, values]), updatedAt })
      } catch (cacheError) {
        console.error("[WOF Finance] Cache update failed after manual entry", { detail: cacheError instanceof Error ? cacheError.message.slice(0, 120) : "unknown" })
      }
      return {
        ok: true,
        code: "OK",
        message: isCardOrRecurringPayment(paymentMethod)
          ? "Záväzok pridaný a označený ako uhradený."
          : "Záväzok pridaný. Úhrada ostáva neoverená do kontroly výpisu alebo dokladu.",
        id,
      }
    } catch {
      return { ok: false, code: "SOURCE_ERROR", message: "Nepodarilo sa zapísať záväzok. Over prístup dashboardu k WOF Google účtu.", id: "" }
    }
  },
})

export const markPayablePaidManually = action({
  args: {
    documentIds: v.array(v.string()),
    paymentDate: v.string(),
    amount: v.optional(v.number()),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), message: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) {
      return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k zápisu do WOF financií." }
    }

    const ids = [...new Set(args.documentIds.map(id => id.trim()).filter(Boolean))]
    const paymentDate = args.paymentDate.trim()
    const reference = text(args.reference).slice(0, 200)
    const note = text(args.note).slice(0, 500)
    if (!ids.length || ids.length > 10) {
      return { ok: false, code: "INVALID_IDS", message: "Vybrané doklady sa nedajú bezpečne identifikovať." }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(Date.parse(paymentDate + "T12:00:00Z"))) {
      return { ok: false, code: "INVALID_DATE", message: "Zadaj platný dátum úhrady." }
    }
    try {
      const response = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute",
        toolName: "GOOGLESHEETS_VALUES_GET",
        appName: "GOOGLESHEETS",
        params: {
          spreadsheet_id: "1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8",
          range: "'Doklady'!A1:AK1000",
          major_dimension: "ROWS",
          value_render_option: "FORMATTED_VALUE",
        },
      })
      const sourceRows = rowsFromResponse(response)
      if (!sourceRows.length || text(sourceRows[0][0]) !== "Doklad ID") {
        return { ok: false, code: "SOURCE_ERROR", message: "WOF register nie je dostupný. Platbu som nezmenil." }
      }

      const matching = sourceRows.slice(1).map((row, index) => ({ row, sheetRow: index + 2 }))
        .filter(item => ids.includes(text(item.row[0])))
      const foundIds = new Set(matching.map(item => text(item.row[0])))
      if (foundIds.size !== ids.length) {
        return { ok: false, code: "NOT_FOUND", message: "Niektorý doklad sa v registri nenašiel. Obnov prehľad a skús to znova." }
      }
      if (matching.some(item => isCardOrRecurringPayment(text(item.row[19])) || ["uhradené", "uhradene", "paid", "zaplatené", "zaplatene"].includes(text(item.row[20]).toLocaleLowerCase("sk")))) {
        return { ok: false, code: "ALREADY_PAID", message: "Aspoň jeden z dokladov už je označený ako uhradený." }
      }

      const totalAmount = numericAmount(matching[0].row[18])
      const paidSoFar = Math.max(...matching.map(item => numericAmount(item.row[35])))
      const remaining = Math.max(0, totalAmount - paidSoFar)
      const amountToApply = args.amount ?? remaining
      if (!Number.isFinite(amountToApply) || amountToApply <= 0) {
        return { ok: false, code: "INVALID_AMOUNT", message: "Zadaj sumu tejto úhrady väčšiu ako nula." }
      }
      if (!totalAmount || amountToApply > remaining + 0.005) {
        return { ok: false, code: "AMOUNT_EXCEEDS_BALANCE", message: `Zostávajúca neuhradená suma je ${remaining.toFixed(2)}. Zadaj úhradu najviac do tejto výšky.` }
      }
      const paidTotal = Math.min(totalAmount, paidSoFar + amountToApply)
      const fullyPaid = paidTotal >= totalAmount - 0.005
      const paymentStatus = fullyPaid ? "Uhradené" : "Čiastočne uhradené"
      const stamp = new Date().toLocaleDateString("sk-SK", { timeZone: "Europe/Bratislava" })
      const updatedSourceRows = sourceRows.map(row => [...row])
      const updates = matching.map(item => {
        const rowValues = [...item.row]
        const rowPaidSoFar = numericAmount(rowValues[35])
        const rowPaidTotal = Math.min(totalAmount, rowPaidSoFar + amountToApply)
        const audit = [
          text(rowValues[27]),
          `Ručná úhrada ${amountToApply.toFixed(2)} ${text(rowValues[15])} potvrdená v dashboarde: ${paymentDate}`,
          reference ? `Referencia: ${reference}` : "",
          note ? `Poznámka: ${note}` : "",
          `Záznam vytvorený: ${stamp}`,
        ].filter(Boolean).join(" | ")
        const paymentEntry = [
          paymentDate,
          `${amountToApply.toFixed(2)} ${text(rowValues[15])}`,
          reference ? `ref. ${reference}` : "",
          note,
        ].filter(Boolean).join(" · ")
        const history = [text(rowValues[36]), paymentEntry].filter(Boolean).join(" | ").slice(-5000)
        const rangeValues = Array.from({ length: 17 }, (_, offset) => rowValues[20 + offset] ?? "")
        rangeValues[0] = paymentStatus
        rangeValues[1] = reference ? `Ručne: ${reference}` : `Ručne potvrdené ${paymentDate}`
        rangeValues[7] = audit
        rangeValues[15] = rowPaidTotal.toFixed(2)
        rangeValues[16] = history
        rowValues[20] = paymentStatus
        rowValues[21] = reference ? `Ručne: ${reference}` : `Ručne potvrdené ${paymentDate}`
        rowValues[27] = audit
        rowValues[35] = rowPaidTotal.toFixed(2)
        rowValues[36] = history
        updatedSourceRows[item.sheetRow - 1] = rowValues
        return {
          range: `'Doklady'!U${item.sheetRow}:AK${item.sheetRow}`,
          majorDimension: "ROWS",
          values: [rangeValues],
        }
      })
      const writeResponse = await callMacalyJson("/api/client-app/composio-execute", {
        action: "execute",
        toolName: "GOOGLESHEETS_UPDATE_VALUES_BATCH",
        appName: "GOOGLESHEETS",
        params: {
          spreadsheet_id: "1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8",
          valueInputOption: "RAW",
          data: updates,
          includeValuesInResponse: true,
        },
      })
      const writeRoot = record(writeResponse)
      const writeResult = record(writeRoot.result)
      if (writeResult.successful === false || writeRoot.successful === false) {
        return { ok: false, code: "WRITE_FAILED", message: "Zápis úhrady sa nepodarilo dokončiť. Obnov prehľad a skontroluj register." }
      }

      const updatedAt = Date.now()
      try {
        await ctx.runMutation(internal.wofFinance.setPayablesCache, {
          rows: payableRowsFromSource(updatedSourceRows),
          updatedAt,
        })
      } catch (cacheError) {
        console.error("[WOF Finance] Cache update failed after manual payment", {
          detail: cacheError instanceof Error ? cacheError.message.slice(0, 120) : "unknown",
        })
      }
      return {
        ok: true,
        code: "OK",
        message: fullyPaid
          ? `Úhrada ${amountToApply.toFixed(2)} ${text(matching[0].row[15])} bola priradená a záväzok je uhradený.`
          : `Čiastočná úhrada ${amountToApply.toFixed(2)} ${text(matching[0].row[15])} bola priradená. Zostáva ${(totalAmount - paidTotal).toFixed(2)} ${text(matching[0].row[15])}.`,
      }
    } catch (error) {
      console.error("[WOF Finance] Manual payment update failed", {
        detail: error instanceof Error ? error.message.slice(0, 180) : "unknown",
      })
      return { ok: false, code: "SOURCE_ERROR", message: "Nepodarilo sa zapísať ručnú úhradu. Register som ponechal bez potvrdenia." }
    }
  },
})
