import { describe, expect, it } from "vitest"
import { summarizeAssociation } from "../../convex/healthTrackingLogic"

describe("health tracking association summary", () => {
  it("does not produce an association from too little data", () => {
    const result = summarizeAssociation([{ date: "2026-11-18", exposure: 1, outcome: 8 }])
    expect(result.status).toBe("INSUFFICIENT_DATA")
    expect(result.message).toMatch(/aspoň 7/)
  })

  it("requires comparison days", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, "0")}`, exposure: 1, outcome: 7 }))
    expect(summarizeAssociation(rows).status).toBe("NO_COMPARISON")
  })

  it("returns a descriptive difference without causal language", () => {
    const rows = [
      { date: "2026-11-01", exposure: 1, outcome: 8 }, { date: "2026-11-02", exposure: 1, outcome: 7 },
      { date: "2026-11-03", exposure: 1, outcome: 9 }, { date: "2026-11-04", exposure: 0, outcome: 5 },
      { date: "2026-11-05", exposure: 0, outcome: 6 }, { date: "2026-11-06", exposure: 0, outcome: 4 },
      { date: "2026-11-07", exposure: 0, outcome: 5 },
    ]
    const result = summarizeAssociation(rows)
    expect(result.status).toBe("POSSIBLE_ASSOCIATION")
    expect(result.difference).toBe(3)
    expect(result.message).toMatch(/nepreukazuje príčinu/)
  })
})
