import { describe, expect, it } from "vitest"
import { safeName } from "../../convex/financeIntake"

const receivedAt = Date.parse("2026-10-28T08:15:00Z")
const messageId = "18f0abc123def456"

describe("finance email Drive file names", () => {
  it("keeps two same-named attachments from one message distinct", () => {
    const invoice = safeName("faktura.pdf", receivedAt, messageId, "ANGjdJ8attachment-invoice")
    const deliveryNote = safeName("faktura.pdf", receivedAt, messageId, "ANGjdJ8attachment-delivery")
    expect(invoice).not.toBe(deliveryNote)
    expect(invoice.endsWith(".pdf")).toBe(true)
    expect(deliveryNote.endsWith(".pdf")).toBe(true)
    expect(invoice.startsWith("2026-10-28_faktura_")).toBe(true)
  })

  it("reuses the same name for the same attachment so a retry finds the stored file", () => {
    const first = safeName("faktura.pdf", receivedAt, messageId, "ANGjdJ8attachment-invoice")
    const retry = safeName("faktura.pdf", receivedAt, messageId, "ANGjdJ8attachment-invoice")
    expect(retry).toBe(first)
  })

  it("does not put attachment-id punctuation into the Drive query name", () => {
    const name = safeName("faktura.pdf", receivedAt, messageId, "id'with/slash and space")
    expect(name.includes("'")).toBe(false)
    expect(name.includes("/")).toBe(false)
    expect(name.includes(" ")).toBe(false)
  })
})
