import { describe, expect, it } from "vitest"
import { parseStatement, signedTransactionAmount, summaryNumber } from "../../convex/bankStatements"

function statementCsv(rows: string[][]): string {
  const header = ["ID operácie", "Dátum", "Suma", "Mena", "Protiúčet", "Názov protiúčtu", "Adresa", "Názov banky", "KS", "VS", "ŠS", "Poznámka", "Správa", "Typ", "", "", "", "BIC", "Inštrukcia"]
  const line = (fields: string[]) => fields.join(";")
  return [
    "Výpis z účtu č. 12/2026 1234567890/1100",
    "Obdobie: 01.10.2026 - 31.10.2026",
    "Začiatočný stav účtu: 1 000,00 EUR",
    "Suma príjmov: 1 500,00 EUR",
    "Suma výdavkov: 250,00 EUR",
    "Konečný stav účtu: 2 250,00 EUR",
    line(header),
    ...rows.map(line),
  ].join("\n")
}

function row(type: string, amount: string, id = "OP1"): string[] {
  return [id, "28.10.2026", amount, "EUR", "SK123", "Partner", "", "Banka", "", "20260019", "", "", "", type, "", "", "", "TATRSKBX", "INS1"]
}

describe("bank statement summary parsing", () => {
  it("parses a space-separated thousands amount", () => {
    expect(summaryNumber(["Konečný stav účtu: 12 345,67 EUR"], "Konečný stav účtu")).toBe(12345.67)
  })

  it("parses a dotted thousands amount", () => {
    expect(summaryNumber(["Suma výdavkov: 1.234,56 EUR"], "Suma výdavkov")).toBe(1234.56)
  })

  it("keeps negative balances", () => {
    expect(summaryNumber(["Začiatočný stav účtu: -250,10 EUR"], "Začiatočný stav účtu")).toBe(-250.1)
  })
})

describe("bank transaction direction", () => {
  it("keeps a received payment positive even when the type contains platba", () => {
    expect(signedTransactionAmount(1500, "Prijatá platba")).toBe(1500)
    expect(signedTransactionAmount(1500, "Prichádzajúca platba")).toBe(1500)
    expect(signedTransactionAmount(-1500, "Príjem")).toBe(1500)
  })

  it("keeps outgoing payments and card charges negative", () => {
    expect(signedTransactionAmount(200, "Odchádzajúca platba")).toBe(-200)
    expect(signedTransactionAmount(50, "Platba kartou")).toBe(-50)
    expect(signedTransactionAmount(20, "Výdaj")).toBe(-20)
  })

  it("treats a fee for an incoming payment as an expense", () => {
    expect(signedTransactionAmount(1.5, "Poplatok za prijatú platbu")).toBe(-1.5)
  })

  it("imports a received platba as income and an outgoing platba as an expense", () => {
    const parsed = parseStatement(statementCsv([
      row("Prijatá platba", "1 500,00", "IN1"),
      row("Odchádzajúca platba", "200,00", "OUT1"),
      row("Platba kartou", "50,00", "CARD1"),
    ]))
    expect(parsed.transactions.map(item => [item.operationId, item.amount])).toEqual([
      ["IN1", 1500],
      ["OUT1", -200],
      ["CARD1", -50],
    ])
  })
})

