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

  it("ships an interactive MFA bootstrap and a non-root read-only container", () => {
    const bridge = fs.readFileSync("integrations/garmin/bridge.py", "utf8")
    const bootstrap = fs.readFileSync("integrations/garmin/bootstrap.py", "utf8")
    const dockerfile = fs.readFileSync("integrations/garmin/Dockerfile", "utf8")
    const compose = fs.readFileSync("integrations/garmin/compose.example.yml", "utf8")
    const preflight = fs.readFileSync("integrations/garmin/preflight.sh", "utf8")
    expect(bootstrap).toContain("resume_login(result[1]")
    expect(bootstrap).toContain("getpass.getpass")
    expect(dockerfile).toContain("USER garmin")
    expect(compose).toContain("no-new-privileges:true")
    expect(compose).toContain("read_only: true")
    expect(compose).toContain("cap_drop:")
    expect(compose).not.toContain("REPLACE_WITH_N8N_WEBHOOK_URL")
    expect(preflight).toContain('[[ "$permissions" == "600" ]]')
    expect(preflight).toContain('[[ ${#webhook_secret} -ge 32 ]]')
    expect(preflight).not.toContain("printf '%s' \"$webhook_secret\"")
    expect(bridge.indexOf('if token_store.exists()')).toBeLessThan(bridge.indexOf('username = required("GARMIN_CONNECT_USERNAME")'))
  })
})
