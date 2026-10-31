import { describe, expect, it } from "vitest"
import { commandCompletionAllowed, commandEligible } from "../../convex/financeCommands"

describe("finance command lease", () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0)

  it("claims pending commands immediately", () => {
    expect(commandEligible("PENDING", now, now)).toBe(true)
  })

  it("does not duplicate a command while its worker lease is live", () => {
    expect(commandEligible("PROCESSING", now - 29 * 60_000, now)).toBe(false)
  })

  it("recovers a processing command after a thirty minute worker failure", () => {
    expect(commandEligible("PROCESSING", now - 30 * 60_000, now)).toBe(true)
  })

  it("never reclaims completed commands and caps failed retries", () => {
    expect(commandEligible("COMPLETED", 0, now)).toBe(false)
    expect(commandEligible("FAILED", now - 30 * 60_000, now, 2)).toBe(true)
    expect(commandEligible("FAILED", now - 30 * 60_000, now, 3)).toBe(false)
  })

  it("accepts callbacks only for the current processing attempt", () => {
    expect(commandCompletionAllowed("PROCESSING", 2, 2)).toBe(true)
    expect(commandCompletionAllowed("PROCESSING", 2, 1)).toBe(false)
    expect(commandCompletionAllowed("FAILED", 2, 2)).toBe(false)
  })
})
