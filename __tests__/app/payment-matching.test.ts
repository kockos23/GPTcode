import { describe, expect, it } from "vitest"
import { findBestPayableMatch, type MatchablePayable, type MatchableTransaction } from "../../convex/paymentMatching"

const transaction: MatchableTransaction = {
  id: "tx-1", amount: -120, currency: "EUR", bookedOn: "2026-10-05",
  counterpartyName: "Dodávateľ SK s.r.o.", variableSymbol: "20260019",
  note: "", recipientMessage: "Úhrada faktúry 2026/0019",
}

const payable: MatchablePayable = {
  id: "doc-1", supplier: "Dodávateľ SK, s.r.o.", invoiceNumber: "2026/0019",
  dueDate: "2026-10-06", amount: "120,00", currency: "EUR",
  paymentStatus: "Neoverené", paidAmount: "",
}

describe("payment matching", () => {
  it("proposes an exact amount and variable-symbol match", () => {
    const result = findBestPayableMatch(transaction, [payable])
    expect(result?.payableId).toBe("doc-1")
    expect(result?.score).toBeGreaterThanOrEqual(100)
  })

  it("matches an exact amount and supplier when no variable symbol is present", () => {
    const result = findBestPayableMatch({ ...transaction, variableSymbol: "", recipientMessage: "" }, [payable])
    expect(result?.payableId).toBe("doc-1")
  })

  it("does not propose an ambiguous equal-score match", () => {
    const second = { ...payable, id: "doc-2", invoiceNumber: "OTHER", supplier: "Dodávateľ SK s.r.o." }
    const result = findBestPayableMatch({ ...transaction, variableSymbol: "", recipientMessage: "" }, [payable, second])
    expect(result).toBeNull()
  })

  it("does not match incoming transactions", () => {
    expect(findBestPayableMatch({ ...transaction, amount: 120 }, [payable])).toBeNull()
  })

  it("does not match another currency", () => {
    expect(findBestPayableMatch(transaction, [{ ...payable, currency: "USD" }])).toBeNull()
  })

  it("ignores already paid documents", () => {
    expect(findBestPayableMatch(transaction, [{ ...payable, paymentStatus: "Uhradené" }])).toBeNull()
  })

  it("allows a partial payment only with a strong reference", () => {
    const result = findBestPayableMatch({ ...transaction, amount: -60 }, [payable])
    expect(result?.payableId).toBe("doc-1")
    expect(findBestPayableMatch({ ...transaction, amount: -60, variableSymbol: "", recipientMessage: "" }, [payable])).toBeNull()
  })
})

