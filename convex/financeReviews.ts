import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, internalMutation, internalQuery } from "./_generated/server"

export const FINANCE_REVIEW_CATEGORIES = ["Doklady", "Stripe", "Vypisy", "Vystavene_FA"] as const
const categoryValidator = v.union(
  v.literal("Doklady"), v.literal("Stripe"), v.literal("Vypisy"), v.literal("Vystavene_FA"),
)

export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + "T00:00:00Z")
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value)
}

export function validateFinanceResolution(input: {
  deliveryDate: string
  category: string
  currency?: string
}): string | null {
  if (!validIsoDate(input.deliveryDate)) return "Dátum dodania nie je platný."
  if (!FINANCE_REVIEW_CATEGORIES.includes(input.category as typeof FINANCE_REVIEW_CATEGORIES[number])) {
    return "Cieľový priečinok nie je povolený."
  }
  if (["Doklady", "Vystavene_FA"].includes(input.category) && !validCurrency(input.currency ?? "")) {
    return "Pri faktúre je potrebná platná trojpísmenová mena."
  }
  if (input.currency && !validCurrency(input.currency)) return "Mena nie je platná."
  return null
}

export type ReviewCompletionDecision = "APPLY" | "ALREADY_RESOLVED" | "INVALID_STATE" | "MISSING_EVIDENCE"

export function reviewCompletionDecision(
  status: string,
  ok: boolean,
  targetFileId?: string,
  targetFileUrl?: string,
): ReviewCompletionDecision {
  if (status === "RESOLVED") return "ALREADY_RESOLVED"
  if (status !== "READY") return "INVALID_STATE"
  if (ok && (!targetFileId || !targetFileUrl)) return "MISSING_EVIDENCE"
  return "APPLY"
}

const reviewEventArgs = {
  documentId: v.string(), source: v.string(), sourceFileId: v.string(), sourceFileName: v.string(),
  fileUrl: v.string(), supplier: v.string(), invoiceNumber: v.string(), totalAmount: v.optional(v.number()),
  extractedDeliveryDate: v.optional(v.string()), extractedCategory: v.optional(v.string()),
  extractedCurrency: v.optional(v.string()), reviewReason: v.string(),
}

export const upsertFromN8n = internalMutation({
  args: reviewEventArgs,
  returns: v.object({ id: v.id("financeDocumentReviews"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_document_id", query => query.eq("documentId", args.documentId)).unique()
    const now = Date.now()
    if (existing) {
      if (existing.status === "RESOLVED") return { id: existing._id, created: false }
      await ctx.db.patch(existing._id, { ...args, updatedAt: now })
      return { id: existing._id, created: false }
    }
    const id = await ctx.db.insert("financeDocumentReviews", {
      ...args, status: "REVIEW_REQUIRED", createdAt: now, updatedAt: now,
    })
    return { id, created: true }
  },
})

export const listReviewRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("financeDocumentReviews").withIndex("by_updated_at").order("desc").take(100)
    return rows.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields }))
  },
})

export const listReadyRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_status", query => query.eq("status", "READY")).take(50)
    return rows.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields }))
  },
})

export const setResolution = internalMutation({
  args: {
    id: v.id("financeDocumentReviews"), deliveryDate: v.string(), category: categoryValidator,
    currency: v.optional(v.string()), note: v.optional(v.string()), resolvedBy: v.string(),
  },
  returns: v.object({ ok: v.boolean(), status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (!row) return { ok: false, status: "NOT_FOUND" }
    if (row.status === "RESOLVED") return { ok: true, status: "RESOLVED" }
    const { id, deliveryDate, category, currency, note, resolvedBy } = args
    await ctx.db.patch(id, {
      status: "READY", resolvedDeliveryDate: deliveryDate, resolvedCategory: category,
      resolvedCurrency: currency, resolutionNote: note?.trim() || undefined,
      resolvedBy, resolvedAt: Date.now(), updatedAt: Date.now(), completionError: undefined,
    })
    return { ok: true, status: "READY" }
  },
})

export const completeFromN8n = internalMutation({
  args: {
    documentId: v.string(), ok: v.boolean(), targetFileId: v.optional(v.string()),
    targetFileUrl: v.optional(v.string()), error: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_document_id", query => query.eq("documentId", args.documentId)).unique()
    if (!row) return { ok: false, status: "NOT_FOUND" }
    const decision = reviewCompletionDecision(row.status, args.ok, args.targetFileId, args.targetFileUrl)
    if (decision === "ALREADY_RESOLVED") return { ok: true, status: "RESOLVED" }
    if (decision !== "APPLY") return { ok: false, status: decision }
    const status = args.ok ? "RESOLVED" : "FAILED"
    await ctx.db.patch(row._id, {
      status, targetFileId: args.targetFileId, targetFileUrl: args.targetFileUrl,
      completionError: args.ok ? undefined : (args.error || "Dokončenie v n8n zlyhalo."),
      completedAt: args.ok ? Date.now() : undefined, updatedAt: Date.now(),
    })
    return { ok: true, status }
  },
})

export const listFinanceReviews = action({
  args: {},
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return []
    return await ctx.runQuery(internal.financeReviews.listReviewRows, {})
  },
})

export const resolveFinanceReview = action({
  args: {
    id: v.id("financeDocumentReviews"), deliveryDate: v.string(), category: categoryValidator,
    currency: v.optional(v.string()), note: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), message: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám.", status: "FORBIDDEN" }
    const error = validateFinanceResolution(args)
    if (error) return { ok: false, message: error, status: "INVALID" }
    const result = await ctx.runMutation(internal.financeReviews.setResolution, {
      ...args, resolvedBy: access.email,
    })
    return result.ok
      ? { ok: true, message: "Rozhodnutie je uložené a čaká na bezpečné dokončenie v n8n.", status: result.status }
      : { ok: false, message: "Review položka už neexistuje.", status: result.status }
  },
})
