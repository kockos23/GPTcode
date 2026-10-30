import { describe, expect, it } from "vitest"
import { commandEligible } from "../../convex/financeCommands"

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

  it("never reclaims terminal command states", () => {
    expect(commandEligible("COMPLETED", 0, now)).toBe(false)
    expect(commandEligible("FAILED", 0, now)).toBe(false)
  })
})
