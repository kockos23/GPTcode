import { describe, expect, it } from "vitest"
import { summaryNumber } from "../../convex/bankStatements"

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

