import { describe, expect, it } from "vitest"
import { billduRows, normalizeBillduDocument } from "../../convex/billduDocuments"

describe("Billdu document normalization", () => {
  it("normalizes a complete issued invoice without using receipt time", () => {
    const result = normalizeBillduDocument({
      id: 42,
      number: "2026-0042",
      status: "sent",
      type: "invoice",
      issue_date: "2026-10-01",
      delivery_date: "2026-09-30",
      due_date: "2026-10-15",
      currency: "eur",
      total_amount: "1.535,00",
      customer: { name: "Test klient" },
    })
    expect(result).toEqual(expect.objectContaining({
      documentId: "billdu:42", deliveryDate: "2026-09-30", issueDate: "2026-10-01",
      currency: "EUR", totalAmount: 1535, customer: "Test klient", safeToImport: true,
    }))
  })

  it("never substitutes issue date for a missing delivery date", () => {
    const result = normalizeBillduDocument({ id: 1, number: "1", status: "sent", issueDate: "2026-10-01", currency: "EUR", total: 10 })
    expect(result.deliveryDate).toBe("")
    expect(result.safeToImport).toBe(false)
    expect(result.reviewReasons).toContain("Chýba dátum dodania")
  })

  it("rejects drafts and cancelled documents", () => {
    for (const status of ["draft", "cancelled", "void"]) {
      expect(normalizeBillduDocument({ id: 1, number: "1", status, deliveryDate: "2026-10-01", currency: "EUR", total: 10 }).safeToImport).toBe(false)
    }
  })

  it("extracts rows only from supported collection envelopes", () => {
    expect(billduRows({ documents: [{ id: 1 }] })).toEqual([{ id: 1 }])
    expect(billduRows({ unexpected: [{ id: 1 }] })).toEqual([])
  })
})
