import { describe, expect, it } from "vitest"
import { constantTimeTextEqual, validRegisterRows } from "../../convex/http"

describe("n8n HTTP boundaries", () => {
  it("accepts only exactly equal authorization text", () => {
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-value")).toBe(true)
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-valuE")).toBe(false)
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-value-extra")).toBe(false)
    expect(constantTimeTextEqual("", "Bearer correct-value")).toBe(false)
  })

  it("accepts bounded primitive register rows", () => {
    expect(validRegisterRows([["Doklad ID", "Suma"], ["WOF-1", 12.5], ["WOF-2", null, true]])).toBe(true)
  })

  it("rejects malformed or oversized register rows without silently filtering them", () => {
    expect(validRegisterRows([])).toBe(false)
    expect(validRegisterRows([["header"], { value: "not a row" }])).toBe(false)
    expect(validRegisterRows([[{ nested: "not a cell" }]])).toBe(false)
    expect(validRegisterRows([["x".repeat(5001)]])).toBe(false)
    expect(validRegisterRows([Array.from({ length: 101 }, () => "x")])).toBe(false)
    expect(validRegisterRows(Array.from({ length: 5002 }, () => ["x"]))).toBe(false)
  })
})
