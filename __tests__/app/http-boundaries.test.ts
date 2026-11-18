import { describe, expect, it } from "vitest"
import { allowedDriveUrl, constantTimeTextEqual, validHealthDailyPayload, validPersonalSignalPayload, validRegisterRows } from "../../convex/http"

describe("n8n HTTP boundaries", () => {
  it("accepts only exactly equal authorization text", () => {
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-value")).toBe(true)
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-valuE")).toBe(false)
    expect(constantTimeTextEqual("Bearer correct-value", "Bearer correct-value-extra")).toBe(false)
    expect(constantTimeTextEqual("", "Bearer correct-value")).toBe(false)
  })

  it("accepts bounded primitive register rows", () => {
    expect(validRegisterRows([["Doklad ID", "Suma"], ["WOF-1", 12.5], ["WOF-2", null, true]])).toBe(true)
  })

  it("rejects malformed or oversized register rows without silently filtering them", () => {
    expect(validRegisterRows([])).toBe(false)
    expect(validRegisterRows([["header"], { value: "not a row" }])).toBe(false)
    expect(validRegisterRows([[{ nested: "not a cell" }]])).toBe(false)
    expect(validRegisterRows([["x".repeat(5001)]])).toBe(false)
    expect(validRegisterRows([Array.from({ length: 101 }, () => "x")])).toBe(false)
    expect(validRegisterRows(Array.from({ length: 5002 }, () => ["x"]))).toBe(false)
  })

  it("accepts only HTTPS Google Drive evidence URLs", () => {
    expect(allowedDriveUrl("https://drive.google.com/file/d/file-1/view")).toBe(true)
    expect(allowedDriveUrl("http://drive.google.com/file/d/file-1/view")).toBe(false)
    expect(allowedDriveUrl("https://drive.google.com.evil.test/file/d/file-1/view")).toBe(false)
    expect(allowedDriveUrl("javascript:alert(1)")).toBe(false)
    expect(allowedDriveUrl("not-a-url")).toBe(false)
  })

  it("accepts bounded personal operation signals", () => {
    expect(validPersonalSignalPayload({
      signalId: "sig-1", dedupeKey: "garmin:2026-11-18", domain: "HEALTH", source: "GARMIN_CONNECT",
      kind: "DAILY_SUMMARY", title: "Denný zdravotný súhrn", summary: "Bez odchýlky", severity: "INFO",
      occurredAt: Date.now(), payload: { steps: 8500 },
    })).toBe(true)
  })

  it("rejects unknown domains, unbounded payloads and invalid timestamps", () => {
    const base = {
      signalId: "sig-1", dedupeKey: "x", domain: "HOME", source: "MANUAL", kind: "READING",
      title: "Odpočet", summary: "", severity: "INFO", occurredAt: Date.now(), payload: {},
    }
    expect(validPersonalSignalPayload({ ...base, domain: "UNKNOWN" })).toBe(false)
    expect(validPersonalSignalPayload({ ...base, occurredAt: Number.NaN })).toBe(false)
    expect(validPersonalSignalPayload({ ...base, payload: { text: "x".repeat(20_001) } })).toBe(false)
  })

  it("accepts only bounded Garmin daily payloads", () => {
    const valid = {
      snapshotId: "garmin:2026-11-18", date: "2026-11-18", source: "GARMIN_CONNECT",
      occurredAt: Date.now(), metrics: { steps: 10_000, sleepMinutes: 420 },
    }
    expect(validHealthDailyPayload(valid)).toBe(true)
    expect(validHealthDailyPayload({ ...valid, source: "APPLE_HEALTH" })).toBe(false)
    expect(validHealthDailyPayload({ ...valid, date: "18.11.2026" })).toBe(false)
    expect(validHealthDailyPayload({ ...valid, metrics: "not-an-object" })).toBe(false)
  })
})
