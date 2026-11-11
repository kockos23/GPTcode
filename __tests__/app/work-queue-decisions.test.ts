import { describe, expect, it } from "vitest"
import { applyWorkQueueDecisions } from "../../convex/chiefOfStaff"

const waiting = (id: string, status = "ČAKÁ NA SCHVÁLENIE") => ({
  id, title: id, status, updated: "sheet",
})

describe("work queue approval decisions", () => {
  const decisions = [
    { taskId: "A1", status: "READY" as const, updated: "approved" },
    { taskId: "P1", status: "PLÁNOVANÉ" as const, updated: "postponed" },
  ]

  it("keeps an approval when the next sheet sync still says the task is waiting", () => {
    const merged = applyWorkQueueDecisions([
      waiting("A1"),
      waiting("P1"),
      waiting("N1"),
    ], decisions)
    expect(merged).toEqual([
      { id: "A1", title: "A1", status: "READY", updated: "approved" },
      { id: "P1", title: "P1", status: "PLÁNOVANÉ", updated: "postponed" },
      waiting("N1"),
    ])
  })

  it("lets a newer sheet status replace a stored decision", () => {
    const merged = applyWorkQueueDecisions([
      waiting("A1", "DONE"),
      waiting("P1", "READY"),
    ], decisions)
    expect(merged).toEqual([
      waiting("A1", "DONE"),
      waiting("P1", "READY"),
    ])
  })

  it("leaves the queue unchanged when there is no decision", () => {
    const queue = [waiting("A1")]
    expect(applyWorkQueueDecisions(queue, [])).toEqual(queue)
    expect(applyWorkQueueDecisions(null, decisions)).toEqual([])
  })
})
