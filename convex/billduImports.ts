import { v } from "convex/values"
import { internalMutation } from "./_generated/server"

const LEASE_MS = 30 * 60 * 1000

export type ExistingBillduImport = {
  sourceVersion: string
  status: string
  leaseUntil?: number
}

export type BillduClaimDecision = "CLAIM" | "ALREADY_IMPORTED" | "BUSY"

export function billduClaimDecision(
  existing: ExistingBillduImport | null,
  sourceVersion: string,
  now: number,
): BillduClaimDecision {
  if (!existing) return "CLAIM"
  if (existing.status === "COMPLETED" && existing.sourceVersion === sourceVersion) return "ALREADY_IMPORTED"
  if (existing.status === "PROCESSING" && (existing.leaseUntil ?? 0) > now) return "BUSY"
  return "CLAIM"
}

export const claim = internalMutation({
  args: {
    sourceDocumentId: v.string(),
    sourceVersion: v.string(),
    invoiceNumber: v.string(),
    deliveryDate: v.string(),
    currency: v.string(),
    totalAmount: v.number(),
  },
  returns: v.object({ status: v.string(), attempts: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db.query("billduDocumentImports")
      .withIndex("by_source_document", query => query.eq("sourceDocumentId", args.sourceDocumentId))
      .unique()
    const decision = billduClaimDecision(existing, args.sourceVersion, now)
    if (decision !== "CLAIM") return { status: decision, attempts: existing?.attempts ?? 0 }
    const attempts = (existing?.attempts ?? 0) + 1
    const fields = {
      ...args,
      status: "PROCESSING",
      attempts,
      leaseUntil: now + LEASE_MS,
      updatedAt: now,
      error: undefined,
      driveFileId: undefined,
      driveFileUrl: undefined,
      registerDocumentId: undefined,
      completedAt: undefined,
    }
    if (existing) await ctx.db.patch(existing._id, fields)
    else await ctx.db.insert("billduDocumentImports", { ...fields, createdAt: now })
    return { status: "CLAIMED", attempts }
  },
})

export const complete = internalMutation({
  args: {
    sourceDocumentId: v.string(),
    sourceVersion: v.string(),
    ok: v.boolean(),
    driveFileId: v.optional(v.string()),
    driveFileUrl: v.optional(v.string()),
    registerDocumentId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), code: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("billduDocumentImports")
      .withIndex("by_source_document", query => query.eq("sourceDocumentId", args.sourceDocumentId))
      .unique()
    if (!existing || existing.sourceVersion !== args.sourceVersion || existing.status !== "PROCESSING") {
      return { ok: false, code: "NOT_PROCESSING" }
    }
    const now = Date.now()
    if (args.ok && (!args.driveFileId || !args.driveFileUrl || !args.registerDocumentId)) {
      return { ok: false, code: "MISSING_EVIDENCE" }
    }
    await ctx.db.patch(existing._id, {
      status: args.ok ? "COMPLETED" : "FAILED",
      leaseUntil: undefined,
      driveFileId: args.driveFileId,
      driveFileUrl: args.driveFileUrl,
      registerDocumentId: args.registerDocumentId,
      error: args.ok ? undefined : (args.error || "Billdu import zlyhal").slice(0, 500),
      updatedAt: now,
      completedAt: args.ok ? now : undefined,
    })
    return { ok: true, code: args.ok ? "COMPLETED" : "FAILED" }
  },
})
