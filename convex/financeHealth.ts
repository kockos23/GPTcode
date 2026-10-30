import { internalQuery } from "./_generated/server"

const HOUR_MS = 60 * 60 * 1000

export type FinanceHealthInput = {
  now: number
  registerUpdatedAt: number | null
  oldestPendingAt: number | null
  oldestProcessingAt: number | null
  failedCommands: number
  failedReviews: number
}

export function financeHealthIssues(input: FinanceHealthInput): string[] {
  const issues: string[] = []
  if (input.registerUpdatedAt === null) issues.push("REGISTER_NEVER_SYNCED")
  else if (input.now - input.registerUpdatedAt > 26 * HOUR_MS) issues.push("REGISTER_STALE")
  if (input.oldestPendingAt !== null && input.now - input.oldestPendingAt > 26 * HOUR_MS) issues.push("COMMAND_PENDING_TOO_LONG")
  if (input.oldestProcessingAt !== null && input.now - input.oldestProcessingAt > 30 * 60 * 1000) issues.push("COMMAND_LEASE_EXPIRED")
  if (input.failedCommands > 0) issues.push("COMMAND_FAILED")
  if (input.failedReviews > 0) issues.push("REVIEW_FAILED")
  return issues
}

export const snapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const cache = await ctx.db.query("wofFinanceCache")
      .withIndex("by_cache_key", query => query.eq("cacheKey", "payables")).unique()
    const latestStatement = await ctx.db.query("bankStatements").withIndex("by_imported_at").order("desc").first()
    const pending = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_status", query => query.eq("status", "PENDING")).take(100)
    const processing = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_status", query => query.eq("status", "PROCESSING")).take(100)
    const failedCommands = await ctx.db.query("financeRegisterCommands")
      .withIndex("by_status", query => query.eq("status", "FAILED")).take(100)
    const failedReviews = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_status", query => query.eq("status", "FAILED")).take(100)
    const readyReviews = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_status", query => query.eq("status", "READY")).take(100)
    const reviewRequired = await ctx.db.query("financeDocumentReviews")
      .withIndex("by_status", query => query.eq("status", "REVIEW_REQUIRED")).take(100)
    const oldest = <T extends { createdAt?: number; updatedAt: number }>(rows: T[]) =>
      rows.length ? Math.min(...rows.map(row => row.createdAt ?? row.updatedAt)) : null
    const input: FinanceHealthInput = {
      now,
      registerUpdatedAt: cache?.updatedAt ?? null,
      oldestPendingAt: oldest(pending),
      oldestProcessingAt: oldest(processing),
      failedCommands: failedCommands.length,
      failedReviews: failedReviews.length,
    }
    const issues = financeHealthIssues(input)
    return {
      ok: issues.length === 0,
      checkedAt: now,
      issues,
      register: { updatedAt: cache?.updatedAt ?? null, payableCount: cache?.rows.length ?? 0 },
      commands: {
        pending: pending.length, processing: processing.length, failed: failedCommands.length,
        oldestPendingAt: input.oldestPendingAt, oldestProcessingAt: input.oldestProcessingAt,
      },
      reviews: { ready: readyReviews.length, required: reviewRequired.length, failed: failedReviews.length },
      bank: { lastImportedAt: latestStatement?.importedAt ?? null, statementCountKnown: Boolean(latestStatement) },
    }
  },
})
