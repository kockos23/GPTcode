import { describe, expect, it } from "vitest"
import { planSignals, requiresOwnerApproval } from "../../convex/personalOpsLogic"

const now = Date.UTC(2026, 10, 18, 8)

describe("personal operations planner", () => {
  it("prioritizes overdue and critical signals deterministically", () => {
    const actions = planSignals([
      { signalId: "home-info", domain: "HOME", title: "Odpočet vody", summary: "Mesačný odpočet", severity: "INFO", occurredAt: now },
      { signalId: "vehicle-overdue", domain: "VEHICLE", title: "STK", summary: "Termín STK", severity: "HIGH", occurredAt: now, dueAt: now - 1 },
      { signalId: "health-critical", domain: "HEALTH", title: "Regenerácia", summary: "Výrazný pokles", severity: "CRITICAL", occurredAt: now },
    ], now)

    expect(actions.map(action => action.signalId)).toEqual(["vehicle-overdue", "health-critical", "home-info"])
    expect(actions[0]).toMatchObject({ assignedAgent: "VEHICLE_MANAGER", priority: "P0" })
    expect(actions[1]).toMatchObject({ assignedAgent: "HEALTH_COACH", approval: "OWNER", priority: "P1" })
  })

  it("keeps stable ordering and respects the output limit", () => {
    const actions = planSignals([
      { signalId: "b", domain: "HOME", title: "B", summary: "", severity: "INFO", occurredAt: now },
      { signalId: "a", domain: "HOME", title: "A", summary: "", severity: "INFO", occurredAt: now },
    ], now, 1)
    expect(actions.map(action => action.signalId)).toEqual(["a"])
  })

  it("requires owner approval for external and health-changing actions", () => {
    expect(requiresOwnerApproval({ domain: "HOME", action: "PURCHASE leak sensor" })).toBe(true)
    expect(requiresOwnerApproval({ domain: "HEALTH", action: "MOVE TRAINING" })).toBe(true)
    expect(requiresOwnerApproval({ domain: "VEHICLE", action: "Review STK date" })).toBe(false)
  })
})
