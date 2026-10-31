import { describe, expect, it } from "vitest"
import { billduClaimDecision } from "../../convex/billduImports"

describe("Billdu import lease", () => {
  const now = 1_800_000_000_000

  it("claims a document that has never been seen", () => {
    expect(billduClaimDecision(null, "v1", now)).toBe("CLAIM")
  })

  it("does not import the same completed version twice", () => {
    expect(billduClaimDecision({ status: "COMPLETED", sourceVersion: "v1" }, "v1", now)).toBe("ALREADY_IMPORTED")
  })

  it("allows a newer version of a completed document", () => {
    expect(billduClaimDecision({ status: "COMPLETED", sourceVersion: "v1" }, "v2", now)).toBe("CLAIM")
  })

  it("blocks an active lease and retries an expired or failed import", () => {
    expect(billduClaimDecision({ status: "PROCESSING", sourceVersion: "v1", leaseUntil: now + 1 }, "v1", now)).toBe("BUSY")
    expect(billduClaimDecision({ status: "PROCESSING", sourceVersion: "v1", leaseUntil: now - 1 }, "v1", now)).toBe("CLAIM")
    expect(billduClaimDecision({ status: "FAILED", sourceVersion: "v1" }, "v1", now)).toBe("CLAIM")
  })
})
