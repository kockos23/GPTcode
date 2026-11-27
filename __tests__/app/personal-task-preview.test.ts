import { describe, expect, it } from "vitest"
import { previewPersonalTasks, taskPriorityClass } from "../../src/lib/personal-task-preview"

const task = (id: string, status = "NOVÉ", priority = "P2") => ({ id, status, priority })

describe("home personal task preview", () => {
  it("shows a task created in NORA even when the cached briefing does not have it", () => {
    const live = [task("NORA-1")]
    const briefing = [task("SHEET-1", "HOTOVO")]
    expect(previewPersonalTasks(live, briefing).map(item => item.id)).toEqual(["NORA-1"])
  })

  it("drops a task completed in NORA instead of keeping the stale briefing copy", () => {
    const live = [task("NORA-1", "HOTOVO")]
    const briefing = [task("NORA-1", "NOVÉ")]
    expect(previewPersonalTasks(live, briefing)).toEqual([])
  })

  it("uses the briefing only while the live list is still loading", () => {
    const briefing = [task("SHEET-1"), task("SHEET-2", "ZRUŠENÉ")]
    expect(previewPersonalTasks(undefined, briefing).map(item => item.id)).toEqual(["SHEET-1"])
  })

  it("keeps at most five open tasks", () => {
    const live = ["a", "b", "c", "d", "e", "f"].map(id => task(id))
    expect(previewPersonalTasks(live, []).map(item => item.id)).toEqual(["a", "b", "c", "d", "e"])
  })

  it("does not crash when a sheet row has no string priority", () => {
    expect(taskPriorityClass(undefined)).toBe("")
    expect(taskPriorityClass("P1")).toBe("p1")
    expect(taskPriorityClass("DÔLEŽITÉ")).toBe("DÔLEŽITÉ".toLocaleLowerCase("sk").replace("ô", "o").replace("é", "e"))
  })
})