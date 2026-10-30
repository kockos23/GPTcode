import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalMutation, internalQuery } from "./_generated/server"

const paymentMethods = ["Bankový prevod", "Platobná karta", "Trvalý príkaz / paušál", "Hotovosť", "Iné"]

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + "T00:00:00Z")
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const enqueue = internalMutation({
  args: { commandId: v.string(), type: v.string(), payload: v.any(), createdBy: v.string() },
  returns: v.object({ id: v.id("financeRegisterCommands"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_command_id", query => query.eq("commandId", args.commandId)).unique()
    if (existing) return { id: existing._id, created: false }
    const now = Date.now()
    const id = await ctx.db.insert("financeRegisterCommands", {
      ...args, status: "PENDING", createdAt: now, updatedAt: now,
    })
    return { id, created: true }
  },
})

export const listPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_status", query => query.eq("status", "PENDING")).take(50)
    return rows.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields }))
  },
})

export const complete = internalMutation({
  args: { commandId: v.string(), ok: v.boolean(), message: v.optional(v.string()), error: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_command_id", query => query.eq("commandId", args.commandId)).unique()
    if (!row) return { ok: false, status: "NOT_FOUND" }
    if (row.status === "COMPLETED") return { ok: true, status: "COMPLETED" }
    const status = args.ok ? "COMPLETED" : "FAILED"
    await ctx.db.patch(row._id, {
      status, resultMessage: args.message?.slice(0, 500), error: args.error?.slice(0, 500),
      processedAt: Date.now(), updatedAt: Date.now(),
    })
    if (args.ok && row.type === "MARK_PAID") {
      const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {}
      const rawTransactionId = typeof payload.bankTransactionId === "string" ? payload.bankTransactionId : ""
      const transactionId = rawTransactionId ? ctx.db.normalizeId("bankTransactions", rawTransactionId) : null
      if (transactionId) {
        const transaction = await ctx.db.get(transactionId)
        if (transaction?.matchStatus === "ČAKÁ NA ZÁPIS") {
          await ctx.db.patch(transactionId, { matchStatus: "POTVRDENÁ" })
        }
      }
    }
    return { ok: true, status }
  },
})

export const addManualPayable = action({
  args: {
    supplier: v.string(), purpose: v.string(), dueDate: v.string(), amount: v.number(),
    currency: v.string(), paymentMethod: v.string(), invoiceDate: v.optional(v.string()),
    deliveryDate: v.string(), invoiceNumber: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), message: v.string(), id: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k zápisu do WOF financií.", id: "" }
    const supplier = args.supplier.trim()
    const purpose = args.purpose.trim()
    const currency = args.currency.trim().toUpperCase()
    if (!supplier || supplier.length > 200 || !purpose || purpose.length > 500) return { ok: false, code: "INVALID_INPUT", message: "Doplň dodávateľa a stručný účel záväzku.", id: "" }
    if (!validDate(args.dueDate) || !validDate(args.deliveryDate) || (args.invoiceDate && !validDate(args.invoiceDate))) return { ok: false, code: "INVALID_DATE", message: "Dátum nie je platný.", id: "" }
    if (!Number.isFinite(args.amount) || args.amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return { ok: false, code: "INVALID_AMOUNT", message: "Skontroluj sumu a menu.", id: "" }
    if (!paymentMethods.includes(args.paymentMethod)) return { ok: false, code: "INVALID_METHOD", message: "Vyber spôsob úhrady zo zoznamu.", id: "" }
    const id = "WOF-M-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().slice(0, 8).toUpperCase()
    await ctx.runMutation(internal.financeCommands.enqueue, {
      commandId: id, type: "ADD_PAYABLE",
      payload: { ...args, supplier, purpose, currency, invoiceNumber: args.invoiceNumber?.trim() || "" },
      createdBy: access.email,
    })
    return { ok: true, code: "QUEUED", message: "Záväzok je bezpečne zaradený na zápis cez n8n.", id }
  },
})

export const markPayablePaidManually = action({
  args: {
    documentIds: v.array(v.string()), paymentDate: v.string(), amount: v.optional(v.number()),
    reference: v.optional(v.string()), note: v.optional(v.string()), bankTransactionId: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), code: v.string(), message: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, code: "FORBIDDEN", message: "Nemáš prístup k zápisu do WOF financií." }
    const documentIds = [...new Set(args.documentIds.map(value => value.trim()).filter(Boolean))]
    if (!documentIds.length || documentIds.length > 10) return { ok: false, code: "INVALID_IDS", message: "Vybrané doklady sa nedajú bezpečne identifikovať." }
    if (!validDate(args.paymentDate)) return { ok: false, code: "INVALID_DATE", message: "Zadaj platný dátum úhrady." }
    if (args.amount !== undefined && (!Number.isFinite(args.amount) || args.amount <= 0)) return { ok: false, code: "INVALID_AMOUNT", message: "Suma úhrady musí byť väčšia ako nula." }
    const commandId = "PAY-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().slice(0, 8).toUpperCase()
    await ctx.runMutation(internal.financeCommands.enqueue, {
      commandId, type: "MARK_PAID",
      payload: {
        documentIds, paymentDate: args.paymentDate, amount: args.amount,
        reference: args.reference?.trim().slice(0, 200) || "", note: args.note?.trim().slice(0, 500) || "",
        bankTransactionId: args.bankTransactionId?.trim() || "",
      },
      createdBy: access.email,
    })
    return { ok: true, code: "QUEUED", message: "Úhrada je zaradená na bezpečný zápis cez n8n." }
  },
})
