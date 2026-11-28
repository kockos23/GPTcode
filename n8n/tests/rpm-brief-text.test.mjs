import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { clip, rpmNodeCode } from "../../scripts/rpm-brief-text.mjs"

const zone = "Europe/Bratislava"
const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

function instantOn(day, time) {
  for (const offset of ["+01:00", "+02:00"]) {
    const date = new Date(`${day}T${time}:00.000${offset}`)
    if (dayFormat.format(date) === day && clockFormat.format(date) === time) return date.toISOString()
  }
  throw new Error(`No Bratislava instant for ${day} ${time}`)
}

function runBrief(code, { timestamp, snapshot, ok = true, state = {} }) {
  const $ = (name) => ({
    first: () => ({
      json: name === "Chief of Staff sync — twice daily" ? { timestamp } : snapshot,
    }),
  })
  return new Function("$", "$json", "$getWorkflowStaticData", code)($, { ok }, () => state)
}

test("escapes Telegram legacy Markdown reserved characters", () => {
  assert.equal(clip("Weekly_sync"), "Weekly\\_sync")
  assert.equal(clip("Call [Alice]"), "Call \\[Alice]")
  assert.equal(clip("*urgent* and `code`"), "\\*urgent\\* and \\`code\\`")
  assert.equal(clip("R&D review"), "R&D review")
  assert.equal(clip("  a\\b_c  "), "a\\\\b\\_c")
})

test("morning brief escapes titles before the Telegram send", () => {
  const today = dayFormat.format(new Date())
  const state = {}
  const sent = runBrief(rpmNodeCode(), {
    timestamp: instantOn(today, "07:05"),
    state,
    snapshot: {
      calendar: [
        { title: "Weekly_sync", start: instantOn(today, "09:00"), allDay: false },
        { title: "Call [Alice]", start: today, allDay: true },
      ],
      tasks: [{ title: "Send_Q4*report", deadline: today, status: "NOVÉ" }],
    },
  })
  assert.equal(sent.length, 1)
  const text = sent[0].json.text
  assert.match(text, /Weekly\\_sync/)
  assert.match(text, /Call \\\[Alice\]/)
  assert.match(text, /Send\\_Q4\\\*report/)
  assert.equal(text.includes("Weekly_sync"), false)
  assert.equal(state.rpmSentDate, today)
  assert.equal(runBrief(rpmNodeCode(), {
    timestamp: instantOn(today, "07:05"),
    state,
    snapshot: { calendar: [], tasks: [] },
  }).length, 0)
})

test("afternoon sync does not send or consume today's brief", () => {
  const today = dayFormat.format(new Date())
  const state = {}
  const sent = runBrief(rpmNodeCode(), {
    timestamp: instantOn(today, "17:05"),
    state,
    snapshot: { calendar: [{ title: "Weekly_sync", start: instantOn(today, "09:00"), allDay: false }], tasks: [] },
  })
  assert.deepEqual(sent, [])
  assert.equal(state.rpmSentDate, undefined)
})

test("installer uses the escaped brief and can refresh an existing node", () => {
  const script = fs.readFileSync(new URL("../../scripts/add-rpm-telegram-brief.mjs", import.meta.url), "utf8")
  assert.match(script, /rpmNodeCode\(/)
  assert.match(script, /mode: existing \? "update" : "insert"/)
})
