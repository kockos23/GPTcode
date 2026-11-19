import { describe, expect, it } from "vitest"
import { consumptionDelta, dueMaintenanceSignals, subscriptionRenewalSignal } from "../../convex/homeVehicleLogic"

const day = 86_400_000
const now = Date.UTC(2026, 10, 18)

describe("home and vehicle agent rules", () => {
  it("creates escalating maintenance signals", () => {
    const signals = dueMaintenanceSignals([
      { maintenanceId: "car-stk", domain: "VEHICLE", title: "STK", nextDueAt: now + 2 * day, leadDays: [60, 30, 14, 3] },
      { maintenanceId: "chimney", domain: "HOME", title: "Kontrola komína", nextDueAt: now - day, leadDays: [30, 14, 3] },
      { maintenanceId: "far-away", domain: "HOME", title: "Revízia", nextDueAt: now + 100 * day, leadDays: [30] },
    ], now)
    expect(signals.map(signal => [signal.signalId, signal.severity])).toEqual([
      ["maintenance:car-stk:1795132800000:lead-3", "HIGH"],
      ["maintenance:chimney:1794873600000:overdue-week-0", "CRITICAL"],
    ])
  })

  it("calculates only monotonic meter consumption", () => {
    expect(consumptionDelta(1200, 1255.5)).toBe(55.5)
    expect(consumptionDelta(1255, 1200)).toBeNull()
    expect(consumptionDelta(Number.NaN, 10)).toBeNull()
  })

  it("warns about subscriptions within fourteen days", () => {
    expect(subscriptionRenewalSignal({ subscriptionId: "freeletics", name: "Freeletics", nextRenewalAt: now + 10 * day, amount: 0, currency: "EUR", now }))
      .toMatchObject({ domain: "HOME", severity: "ATTENTION", signalId: expect.stringContaining(":lead-14") })
    expect(subscriptionRenewalSignal({ subscriptionId: "later", name: "Later", nextRenewalAt: now + 20 * day, now })).toBeNull()
  })

  it("creates a new stage only at meaningful reminder thresholds", () => {
    const input = { subscriptionId: "service", name: "Service", nextRenewalAt: now + 10 * day, now }
    expect(subscriptionRenewalSignal(input)?.signalId).toContain(":lead-14")
    expect(subscriptionRenewalSignal({ ...input, now: now + 4 * day })?.signalId).toContain(":lead-7")
    expect(subscriptionRenewalSignal({ ...input, now: now + 9 * day })?.signalId).toContain(":lead-1")
    expect(subscriptionRenewalSignal({ ...input, now: now + 11 * day })?.signalId).toContain(":overdue-week-0")
  })
})
