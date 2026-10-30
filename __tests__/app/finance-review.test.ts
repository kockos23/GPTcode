import { describe, expect, it } from "vitest"
import { validCurrency, validIsoDate, validateFinanceResolution } from "../../convex/financeReviews"

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
