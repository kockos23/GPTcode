import { describe, expect, it } from "vitest"
import { payableRowsFromSource } from "../../convex/wofFinance"

describe("finance register snapshot normalization", () => {
  const header = Array.from({ length: 37 }, () => "")
  header[0] = "Doklad ID"

  it("maps the operational Sheets columns into the Convex cache shape", () => {
    const row = Array.from({ length: 37 }, () => "")
    row[0] = "WOF-test-1"
    row[3] = "faktura"
    row[4] = "Zaradené"
    row[8] = "2026-10-15"
    row[9] = "Dodávateľ"
    row[13] = "2026001"
    row[15] = "EUR"
    row[18] = "120.50"
    row[19] = "Bankový prevod"
    row[20] = "Neoverené"
    row[23] = "https://drive.google.com/file/d/test/view"
    row[31] = "Testovací doklad"

    expect(payableRowsFromSource([header, row])).toEqual([expect.objectContaining({
      id: "WOF-test-1", supplier: "Dodávateľ", invoiceNumber: "2026001",
      amount: "120.50", currency: "EUR", paymentStatus: "Neoverené",
    })])
  })

  it("marks card and recurring payments as paid without changing the source row", () => {
    const row = Array.from({ length: 37 }, () => "")
    row[0] = "WOF-card"
    row[18] = "25.00"
    row[19] = "Platobná karta"
    expect(payableRowsFromSource([header, row])[0]).toEqual(expect.objectContaining({
      paymentStatus: "Uhradené", paidAmount: "25.00",
    }))
  })

  it("skips empty register rows", () => {
    expect(payableRowsFromSource([header, Array(37).fill("")])).toEqual([])
  })
})
