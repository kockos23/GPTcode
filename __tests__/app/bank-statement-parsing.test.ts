import { describe, expect, it } from "vitest"
import { bankStatementNeedsResume, parseStatement, summaryNumber } from "../../convex/bankStatements"

describe("bank statement summary parsing", () => {
  it("parses a space-separated thousands amount", () => {
    expect(summaryNumber(["Konečný stav účtu: 12 345,67 EUR"], "Konečný stav účtu")).toBe(12345.67)
  })

  it("parses a dotted thousands amount", () => {
    expect(summaryNumber(["Suma výdavkov: 1.234,56 EUR"], "Suma výdavkov")).toBe(1234.56)
  })

  it("parses English thousands without changing scale", () => {
    expect(summaryNumber(["Suma príjmov: 1,234.56 EUR"], "Suma príjmov")).toBe(1234.56)
    expect(summaryNumber(["Suma príjmov: 1,234 EUR"], "Suma príjmov")).toBe(1234)
  })

  it("keeps negative balances", () => {
    expect(summaryNumber(["Začiatočný stav účtu: -250,10 EUR"], "Začiatočný stav účtu")).toBe(-250.1)
  })
})

describe("bank statement CSV", () => {
  const header = [
    "ID operácie", "Dátum zaúčtovania", "Suma", "Mena", "Protiúčet", "Názov protiúčtu",
    "Názov banky protiúčtu", "Banka", "Konštantný symbol", "Variabilný symbol",
    "Špecifický symbol", "Poznámka", "Správa pre prijímateľa", "Typ transakcie",
    "Pole 14", "Pole 15", "Pole 16", "BIC", "ID pokynu",
  ].join(";")

  const csv = [
    "Výpis č. 10/2026 z účtu 1234567890/1100",
    "Obdobie: 01.10.2026 - 31.10.2026",
    "Začiatočný stav účtu: 1 000,00 EUR",
    "Konečný stav účtu: 850,00 EUR",
    "Suma príjmov: 50,00 EUR",
    "Suma výdavkov: 200,00 EUR",
    header,
    ["op-1", "05.10.2026", "200,00", "EUR", "SK001", "Dodávateľ", "", "Banka", "", "26231243", "", "Faktúra", "Úhrada", "Výdaj", "", "", "", "TATRSKBX", "instr-1"].join(";"),
    ["op-2", "10.10.2026", "50,00", "EUR", "SK002", "Klient", "", "Banka", "", "", "", "Platba", "Príjem", "Príjem", "", "", "", "TATRSKBX", "instr-2"].join(";"),
  ].join("\n")

  it("parses period, masked account, balances and signed transactions", () => {
    const parsed = parseStatement(csv)
    expect(parsed.periodStart).toBe("2026-10-01")
    expect(parsed.periodEnd).toBe("2026-10-31")
    expect(parsed.accountNumberMasked).toBe("•••• 1100")
    expect(parsed.openingBalance).toBe(1000)
    expect(parsed.closingBalance).toBe(850)
    expect(parsed.transactions.map(row => row.amount)).toEqual([-200, 50])
    expect(parsed.transactions[0].variableSymbol).toBe("26231243")
  })

  it("rejects a statement without an explicit period", () => {
    expect(() => parseStatement(csv.replace("Obdobie: 01.10.2026 - 31.10.2026", "Obdobie neuvedené")))
      .toThrow("Výpis nemá rozpoznateľnú hlavičku alebo obdobie.")
  })

  it("rejects mixed transaction currencies", () => {
    expect(() => parseStatement(csv.replace("50,00;EUR;SK002", "50,00;USD;SK002")))
      .toThrow("Mena transakcií sa nezhoduje s menou účtu.")
  })

  it("rejects an invalid amount instead of silently importing zero", () => {
    expect(() => parseStatement(csv.replace("200,00;EUR;SK001", "suma;EUR;SK001")))
      .toThrow("Niektorá transakcia má neplatný dátum, sumu alebo menu.")
  })

  it("rejects impossible dates and transactions outside the statement period", () => {
    expect(() => parseStatement(csv.replace("05.10.2026", "31.02.2026")))
      .toThrow("Niektorá transakcia má neplatný dátum, sumu alebo menu.")
    expect(() => parseStatement(csv.replace("05.10.2026", "30.09.2026")))
      .toThrow("Transakcia je mimo obdobia výpisu.")
  })

  it("rejects duplicate operation IDs inside one CSV", () => {
    expect(() => parseStatement(csv.replace("op-2", "op-1")))
      .toThrow("Výpis obsahuje duplicitné ID operácie.")
  })

  it("rejects inconsistent statement totals", () => {
    expect(() => parseStatement(csv.replace("Konečný stav účtu: 850,00 EUR", "Konečný stav účtu: 851,00 EUR")))
      .toThrow("Nesedí počiatočný stav + príjmy - výdavky = konečný stav.")
  })

  it("rejects transaction totals that do not match the statement summary", () => {
    const changedTransaction = csv.replace("05.10.2026;200,00", "05.10.2026;199,00")
    expect(() => parseStatement(changedTransaction))
      .toThrow("Súčty transakcií sa nezhodujú so súhrnom výpisu.")
  })

  it("normalizes a bank-provided negative expense summary", () => {
    const negativeExpense = csv.replace("Suma výdavkov: 200,00 EUR", "Suma výdavkov: -200,00 EUR")
    const parsed = parseStatement(negativeExpense)
    expect(parsed.expenseTotal).toBe(200)
    expect(parsed.closingBalance).toBe(850)
  })

  it("treats an explicitly received payment as income", () => {
    const received = csv.replace(";Príjem;;;;TATRSKBX", ";Prijatá platba;;;;TATRSKBX")
    expect(received).not.toBe(csv)
    expect(parseStatement(received).transactions[1].amount).toBe(50)
  })
})

describe("bank statement recovery", () => {
  it("resumes every unfinished state but not a completed import", () => {
    expect(bankStatementNeedsResume("SPRACÚVA SA")).toBe(true)
    expect(bankStatementNeedsResume("FAILED")).toBe(true)
    expect(bankStatementNeedsResume("NAČÍTANÝ")).toBe(false)
  })
})

