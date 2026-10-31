import { describe, expect, it } from "vitest"
import { billduClaimDecision, billduCompletionAllowed } from "../../convex/billduImports"

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

  it("accepts completion only from the current attempt and version", () => {
    const processing = { status: "PROCESSING", sourceVersion: "v2", attempts: 2 }
    expect(billduCompletionAllowed(processing, "v2", 2)).toBe(true)
    expect(billduCompletionAllowed(processing, "v2", 1)).toBe(false)
    expect(billduCompletionAllowed(processing, "v1", 2)).toBe(false)
    expect(billduCompletionAllowed({ ...processing, status: "COMPLETED" }, "v2", 2)).toBe(false)
  })
})
