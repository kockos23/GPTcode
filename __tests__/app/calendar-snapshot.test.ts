import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("Chief of Staff calendar boundaries", () => {
  it("reads selected visible calendars with metadata", () => {
    const provisioner = fs.readFileSync("scripts/provision-chief-of-staff-sync.mjs", "utf8")
    expect(provisioner).toContain("/users/me/calendarList?minAccessRole=reader")
    expect(provisioner).toContain("Priprav kalendárové požiadavky")
    expect(provisioner).toContain("calendarName")
    expect(provisioner).toContain("readOnly")
  })

  it("keeps every NORA calendar write restricted to primary", () => {
    const builder = fs.readFileSync("scripts/build-nora-calendar-workflow.mjs", "utf8")
    expect(builder).toContain("All writes target only the primary Google Calendar")
    expect(builder).toContain("/calendars/primary/events")
    expect(builder).not.toMatch(/\/calendars\/\{\{|\/calendars\/\$\{/)
  })
})
