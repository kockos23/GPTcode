import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { assertGmailThreadTriage } from "../../scripts/gmail-thread-triage.mjs"
import { candidateUids, imapMoveRequest, selectMovedMessage } from "../../scripts/imap-triage-move.mjs"

const workerSource = readFileSync(path.resolve("scripts/provision-command-worker.mjs"), "utf8")
const stored = {
  subject: "Faktúra 2026-19",
  sender: "Expo <billing@wofevents.com>",
  timestamp: "2026-11-20T09:30:00.000Z",
  providerUid: "1500",
}

describe("IMAP move identity", () => {
  it("does not reuse the inbox UID when returning mail from Archive", () => {
    expect(imapMoveRequest(stored, "INBOX")).toEqual({
      ok: true,
      mode: "search",
      sourceMailbox: "Archive",
      targetMailbox: "INBOX",
      subject: stored.subject,
      senderAddress: "billing@wofevents.com",
      timestamp: stored.timestamp,
    })
  })

  it("searches INBOX again on a later archive, because the stored UID was invalidated by the return", () => {
    expect(imapMoveRequest(stored, "ARCHIVED").mode).toBe("search")
    expect(imapMoveRequest(stored, "MOVED")).not.toHaveProperty("emailUid")
  })

  it("keeps the inbox UID only when the message has no subject or sender to search for", () => {
    expect(imapMoveRequest({ ...stored, subject: "(bez predmetu)" }, "ARCHIVED")).toMatchObject({
      ok: true,
      mode: "uid",
      sourceMailbox: "INBOX",
      emailUid: "1500",
    })
    expect(imapMoveRequest({ ...stored, subject: "(bez predmetu)" }, "INBOX")).toEqual({ ok: false, code: "MISSING_IDENTITY" })
  })

  it("selects the Archive message with the same subject and sender, not the colliding UID", () => {
    const choice = selectMovedMessage(
      { subject: stored.subject, sender: "billing@wofevents.com", timestamp: stored.timestamp },
      [
        { uid: "1500", subject: "Staršia správa", from: { address: "other@wofevents.com" }, date: stored.timestamp },
        { uid: "87", subject: "Faktúra   2026-19", from: { value: [{ address: "billing@wofevents.com", name: "Expo" }] }, date: "2026-11-20T09:30:04.000Z" },
      ],
    )
    expect(choice).toEqual({ ok: true, uid: "87" })
  })

  it("stops when several messages share the subject and sender", () => {
    const candidates = [1, 2].map(uid => ({
      uid,
      subject: stored.subject,
      from: "billing@wofevents.com",
      date: uid === 1 ? stored.timestamp : "2026-11-01T00:00:00.000Z",
    }))
    expect(selectMovedMessage({ subject: stored.subject, sender: stored.sender, timestamp: "not-a-date" }, candidates).code).toBe("AMBIGUOUS")
    expect(selectMovedMessage({ subject: stored.subject, sender: stored.sender, timestamp: stored.timestamp }, candidates)).toEqual({ ok: true, uid: "1" })
  })

  it("refuses a search page that does not contain every hit", () => {
    expect(candidateUids({ searchSummary: { totalFound: 25 }, uids: ["1"] }, 20).code).toBe("AMBIGUOUS")
    expect(candidateUids({ searchSummary: { totalFound: 0 }, uids: [] }).code).toBe("NOT_FOUND")
    expect(candidateUids({ searchSummary: { totalFound: 1 }, uids: ["87"] })).toEqual({ ok: true, uids: ["87"] })
  })

  it("wires the worker to resolve the source message before moving", () => {
    expect(workerSource).toContain("imapMoveHelpersSource()")
    expect(workerSource).toContain("Use stored IMAP UID?")
    expect(workerSource).toContain('WOF Events IMAP — search source')
    expect(workerSource).not.toContain("emailUid:uid,sourceMailbox,targetMailbox")
    expect(workerSource).not.toContain('"Prepare IMAP move":{main:[[{node:"WOF Events IMAP — move email"')
  })
})

describe("Gmail thread triage verification", () => {
  it("accepts a restored thread when a sent reply or draft cannot carry INBOX", () => {
    const messages = [
      { id: "received", labelIds: ["INBOX", "CATEGORY_PERSONAL"] },
      { id: "sent", labelIds: ["SENT"] },
      { id: "draft", labelIds: ["DRAFT"] },
    ]
    expect(assertGmailThreadTriage("INBOX", messages)).toMatchObject({ ok: true, inboxCount: 1, messageCount: 3 })
  })

  it("rejects a restore that left the thread out of the inbox", () => {
    expect(() => assertGmailThreadTriage("INBOX", [{ id: "sent", labelIds: ["SENT"] }])).toThrow(/návrat vlákna do Inboxu/)
    expect(() => assertGmailThreadTriage("INBOX", [])).toThrow(/nevrátil správy/)
  })

  it("rejects an archive while any message is still in the inbox", () => {
    expect(() => assertGmailThreadTriage("ARCHIVED", [
      { id: "received", labelIds: ["INBOX"] },
      { id: "sent", labelIds: ["SENT"] },
    ])).toThrow(/archivovanie/)
    expect(assertGmailThreadTriage("MOVED", [
      { id: "received", labelIds: ["Label_1"] },
      { id: "sent", labelIds: ["SENT"] },
      { id: "draft", labelIds: ["DRAFT"] },
    ])).toMatchObject({ ok: true, inboxCount: 0 })
  })

  it("uses the thread rule in the command worker", () => {
    expect(workerSource).toContain("assertGmailThreadTriage.toString()")
    expect(workerSource).not.toContain("inboxCount!==messages.length")
  })
})
