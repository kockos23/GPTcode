import { describe, expect, it } from "vitest"
import { routeFinanceDocument } from "../../convex/documentRouting"

const invoice = (text: string, overrides: Partial<Parameters<typeof routeFinanceDocument>[0]> = {}) => routeFinanceDocument({
  fileName: "faktura.pdf",
  subject: "Nová faktúra",
  mimeType: "application/pdf",
  text,
  ...overrides,
})

describe("finance document routing", () => {
  it("uses the Slovak delivery date instead of issue and due dates", () => {
    const result = invoice("Faktúra 2026-10-08 Dátum vystavenia: 08.10.2026 Dátum dodania: 30.09.2026 Dátum splatnosti: 22.10.2026")
    expect(result).toMatchObject({ ok: true, category: "Doklady", deliveryDate: "2026-09-30" })
  })

  it("recognizes Czech DUZP", () => {
    const result = invoice("FAKTURA Datum vystavení 2.10.2026 DUZP: 29.09.2026 Datum splatnosti 16.10.2026")
    expect(result).toMatchObject({ ok: true, deliveryDate: "2026-09-29" })
  })

  it("recognizes an English date of supply", () => {
    const result = invoice("INVOICE Issue date 5 October 2026 Date of supply: 2026-09-30 Due date 19 October 2026")
    expect(result).toMatchObject({ ok: true, deliveryDate: "2026-09-30" })
  })

  it("uses the end of an explicit service period", () => {
    const result = invoice("Invoice Service period: 01.09.2026 - 30.09.2026 Total EUR 120")
    expect(result).toMatchObject({ ok: true, deliveryDate: "2026-09-30" })
  })

  it("does not fall back to a date from the file name or email subject", () => {
    const result = invoice("Faktúra suma 120 EUR, splatnosť 15 dní", {
      fileName: "invoice_2026-09-30.pdf",
      subject: "Doklady 09/2026",
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("dátum dodania")
  })

  it("routes a bank statement using the end of its statement period", () => {
    const result = routeFinanceDocument({
      fileName: "bankovy_vypis.csv",
      subject: "Výpis",
      mimeType: "text/csv",
      text: "Výpis za obdobie: 01.09.2026 - 30.09.2026\nID operácie;Dátum;Suma",
    })
    expect(result).toMatchObject({ ok: true, category: "Vypisy", deliveryDate: "2026-09-30" })
  })

  it("routes a Stripe report using its report period", () => {
    const result = routeFinanceDocument({
      fileName: "stripe_report.pdf",
      subject: "Stripe report",
      mimeType: "application/pdf",
      text: "Stripe balance summary Report period: 2026-09-01 - 2026-09-30",
    })
    expect(result).toMatchObject({ ok: true, category: "Stripe", deliveryDate: "2026-09-30" })
  })

  it("routes explicitly identified issued invoices separately", () => {
    const result = invoice("Issued invoice Date of supply: 30/09/2026 Total EUR 500", {
      subject: "[VYSTAVENE_FA] September",
    })
    expect(result).toMatchObject({ ok: true, category: "Vystavene_FA", deliveryDate: "2026-09-30" })
  })

  it("requires review for scans without a text layer", () => {
    const result = invoice("")
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("OCR")
  })
})

