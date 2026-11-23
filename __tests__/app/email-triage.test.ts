import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildEmailTriageContext, parseEmailTriageContext } from "../../convex/emailTriageLogic"
import { imapTriageMailboxes } from "../../scripts/email-triage-mailboxes.mjs"

describe("IMAP triage mailboxes", () => {
  it("archives from the inbox into Archive", () => {
    expect(imapTriageMailboxes("ARCHIVED", "", "")).toEqual({
      sourceMailbox: "INBOX",
      targetMailbox: "Archive",
    })
  })

  it("moves from the inbox into the named Chief HQ folder", () => {
    expect(imapTriageMailboxes("MOVED", "", "Chief HQ - Na neskôr")).toEqual({
      sourceMailbox: "INBOX",
      targetMailbox: "Chief HQ - Na neskôr",
    })
  })

  it("returns a moved message from its Chief HQ folder", () => {
    expect(imapTriageMailboxes("INBOX", "Chief HQ - Na neskôr", "")).toEqual({
      sourceMailbox: "Chief HQ - Na neskôr",
      targetMailbox: "INBOX",
    })
  })

  it("returns an archived message from Archive when no previous folder was stored", () => {
    expect(imapTriageMailboxes("INBOX", "", "")).toEqual({
      sourceMailbox: "Archive",
      targetMailbox: "INBOX",
    })
  })

  it("embeds that mailbox function in the command worker", () => {
    const source = readFileSync(path.resolve("scripts/provision-command-worker.mjs"), "utf8")
    expect(source).toContain("imapTriageMailboxes.toString()")
    expect(source).not.toContain("triage.state==='INBOX'&&triage.previousLabel?triage.previousLabel:'INBOX'")
  })
})

describe("email triage context", () => {
  it("keeps the source account in the fifth field", () => {
    const context = buildEmailTriageContext({
      state: "ARCHIVED",
      folder: "",
      previousFolder: "",
      sourceAccount: "tomas.kocner@wofevents.com",
    })
    const parts = context.split("|")
    const [, , , , skippedByOldReader, missedAccount] = parts
    expect(skippedByOldReader).toBe("tomas.kocner%40wofevents.com")
    expect(missedAccount).toBeUndefined()
    expect(parseEmailTriageContext(context)).toEqual({
      state: "ARCHIVED",
      folder: "",
      previousFolder: "",
      sourceAccount: "tomas.kocner@wofevents.com",
    })
  })

  it("round-trips a folder name and a previous folder", () => {
    const context = buildEmailTriageContext({
      state: "MOVED",
      folder: "Na neskôr",
      previousFolder: "",
      sourceAccount: "tomas.kocner@wofevents.com",
    })
    expect(parseEmailTriageContext(context)).toMatchObject({
      state: "MOVED",
      folder: "Na neskôr",
      sourceAccount: "tomas.kocner@wofevents.com",
    })
  })
})
