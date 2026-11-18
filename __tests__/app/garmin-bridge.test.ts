import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("Garmin bridge normalizer", () => {
  it("keeps the bridge read-only and posts only normalized aggregates", () => {
    const bridge = fs.readFileSync("integrations/garmin/bridge.py", "utf8")
    const normalizer = fs.readFileSync("integrations/garmin/normalize.py", "utf8")
    expect(bridge).toContain("get_stats")
    expect(bridge).toContain("get_sleep_data")
    expect(bridge).toContain("normalize_day")
    expect(bridge).not.toMatch(/set_|delete_|upload_/)
    expect(normalizer).toContain('"sleepMinutes"')
    expect(normalizer).toContain('"bodyBatteryHigh"')
    expect(normalizer).toContain('metrics["sleepMinutes"] = round')
  })
})
