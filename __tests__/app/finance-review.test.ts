import { describe, expect, it } from "vitest"
import { reviewCompletionDecision, validCurrency, validIsoDate, validateFinanceResolution } from "../../convex/financeReviews"

describe("finance review validation", () => {
  it("accepts a real delivery date and ISO currency for an invoice", () => {
    expect(validateFinanceResolution({
      deliveryDate: "2026-09-30", category: "Doklady", currency: "EUR",
    })).toBeNull()
  })

  it("rejects impossible calendar dates", () => {
    expect(validIsoDate("2026-02-29")).toBe(false)
    expect(validateFinanceResolution({
      deliveryDate: "2026-02-29", category: "Doklady", currency: "EUR",
    })).toBe("Dátum dodania nie je platný.")
  })

  it("requires currency for incoming and issued invoices", () => {
    expect(validateFinanceResolution({
      deliveryDate: "2026-09-30", category: "Doklady",
    })).toMatch(/mena/i)
    expect(validateFinanceResolution({
      deliveryDate: "2026-09-30", category: "Vystavene_FA", currency: "EURO",
    })).toMatch(/mena/i)
  })

  it("allows a statement resolution without inventing a currency", () => {
    expect(validateFinanceResolution({
      deliveryDate: "2026-09-30", category: "Vypisy",
    })).toBeNull()
  })

  it("accepts only uppercase ISO-like currencies and known destinations", () => {
    expect(validCurrency("USD")).toBe(true)
    expect(validCurrency("eur")).toBe(false)
    expect(validateFinanceResolution({
      deliveryDate: "2026-09-30", category: "Archive", currency: "EUR",
    })).toMatch(/priečinok/i)
  })
})

describe("finance review completion", () => {
  it("accepts success only from READY with Drive evidence", () => {
    expect(reviewCompletionDecision("READY", true, "file-1", "https://drive.google.com/file/d/file-1/view")).toBe("APPLY")
    expect(reviewCompletionDecision("READY", true)).toBe("MISSING_EVIDENCE")
  })

  it("does not allow a late callback to regress a resolved review", () => {
    expect(reviewCompletionDecision("RESOLVED", false)).toBe("ALREADY_RESOLVED")
    expect(reviewCompletionDecision("REVIEW_REQUIRED", true, "file-1", "https://example.test")).toBe("INVALID_STATE")
    expect(reviewCompletionDecision("FAILED", true, "file-1", "https://example.test")).toBe("INVALID_STATE")
  })
})
