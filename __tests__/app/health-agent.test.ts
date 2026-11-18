import { describe, expect, it } from "vitest"
import { analyzeHealthDay, normalizeGarminDaily } from "../../convex/healthAgentLogic"

describe("health agent Garmin normalization", () => {
  it("keeps bounded Garmin/CIRQA metrics and drops impossible values", () => {
    expect(normalizeGarminDaily({
      steps: 12_345, sleepMinutes: 420, restingHeartRate: 54, averageStress: 31,
      bodyBatteryHigh: 88, activities: 2, activeCalories: -10, unknown: "ignored",
    })).toEqual({
      steps: 12_345, sleepMinutes: 420, restingHeartRate: 54, averageStress: 31,
      intensityMinutes: undefined, activeCalories: undefined, bodyBatteryLow: undefined,
      bodyBatteryHigh: 88, activities: 2,
    })
  })

  it("creates advisory signals without medical diagnosis", () => {
    const signals = analyzeHealthDay({
      date: "2026-11-18", occurredAt: Date.now(), baseline: { restingHeartRate: 52 },
      metrics: { sleepMinutes: 280, restingHeartRate: 64, averageStress: 75 },
    })
    expect(signals.map(signal => signal.signalId)).toEqual([
      "health:sleep:2026-11-18", "health:rhr:2026-11-18", "health:stress:2026-11-18",
    ])
    expect(signals.every(signal => signal.domain === "HEALTH")).toBe(true)
    expect(signals.map(signal => signal.summary).join(" ")).not.toMatch(/diagnóz/i)
  })
})
