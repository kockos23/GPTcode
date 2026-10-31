import { describe, expect, it } from "vitest"
import { financeHealthIssues } from "../../convex/financeHealth"

describe("finance health evaluation", () => {
  const now = Date.UTC(2026, 9, 31, 8, 0, 0)
  const healthy = {
    now,
    registerUpdatedAt: now - 12 * 60 * 60 * 1000,
    oldestPendingAt: null,
    oldestProcessingAt: null,
    failedCommands: 0,
    failedReviews: 0,
    oldestBillduProcessingAt: null,
    failedBillduImports: 0,
  }

  it("accepts a fresh and empty operational queue", () => {
    expect(financeHealthIssues(healthy)).toEqual([])
  })

  it("detects a register that never synchronized or became stale", () => {
    expect(financeHealthIssues({ ...healthy, registerUpdatedAt: null })).toContain("REGISTER_NEVER_SYNCED")
    expect(financeHealthIssues({ ...healthy, registerUpdatedAt: now - 27 * 60 * 60 * 1000 })).toContain("REGISTER_STALE")
  })

  it("detects abandoned leases and long-pending commands", () => {
    const issues = financeHealthIssues({
      ...healthy,
      oldestProcessingAt: now - 31 * 60 * 1000,
      oldestPendingAt: now - 27 * 60 * 60 * 1000,
    })
    expect(issues).toEqual(expect.arrayContaining(["COMMAND_LEASE_EXPIRED", "COMMAND_PENDING_TOO_LONG"]))
  })

  it("surfaces failed commands and reviews", () => {
    expect(financeHealthIssues({ ...healthy, failedCommands: 1, failedReviews: 2 }))
      .toEqual(expect.arrayContaining(["COMMAND_FAILED", "REVIEW_FAILED"]))
  })

  it("surfaces failed and abandoned Billdu imports", () => {
    expect(financeHealthIssues({
      ...healthy,
      oldestBillduProcessingAt: now - 31 * 60 * 1000,
      failedBillduImports: 1,
    })).toEqual(expect.arrayContaining(["BILLDU_LEASE_EXPIRED", "BILLDU_IMPORT_FAILED"]))
  })
})
