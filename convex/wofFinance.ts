import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalMutation, internalQuery } from "./_generated/server"

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim()
}

function isCardOrRecurringPayment(method: string): boolean {
  return ["platobná karta", "trvalý príkaz / paušál"].includes(method.trim().toLocaleLowerCase("sk"))
}

export function payableRowsFromSource(sourceRows: unknown[][]) {
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

export const syncPayablesFromN8n = internalMutation({
  args: { sourceRows: v.array(v.array(v.any())), syncedAt: v.number() },
  returns: v.object({ ok: v.boolean(), count: v.number(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    if (!args.sourceRows.length || text(args.sourceRows[0]?.[0]) !== "Doklad ID") {
      throw new Error("Register nemá očakávanú hlavičku Doklad ID.")
    }
    if (args.sourceRows.length > 5001) throw new Error("Register presahuje limit 5000 riadkov.")
    const rows = payableRowsFromSource(args.sourceRows)
    const updatedAt = Number.isFinite(args.syncedAt) && args.syncedAt > 0 ? args.syncedAt : Date.now()
    const cached = await ctx.db.query("wofFinanceCache")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "payables"))
      .unique()
    if (cached) await ctx.db.patch(cached._id, { rows, updatedAt })
    else await ctx.db.insert("wofFinanceCache", { cacheKey: "payables", rows, updatedAt })
    return { ok: true, count: rows.length, updatedAt }
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
    if (!cached) return {
      ok: false, code: "NOT_SYNCED",
      message: "WOF register ešte nebol synchronizovaný cez n8n.", updatedAt: 0, rows: [],
    }
    return {
      ok: true, code: "CACHE", message: "Používam posledný stav synchronizovaný cez n8n.",
      updatedAt: cached.updatedAt, rows: cached.rows,
    }
  },
})
