import { describe, expect, it } from "vitest"
import { toBriefingEmail } from "../../convex/liveBriefingLogic"

describe("live briefing emails", () => {
  it("keeps inbox triage and drops fields the refresh validator does not declare", () => {
    expect(toBriefingEmail({
      id: "imap:tomas.kocner@wofevents.com:<a@b>",
      threadId: "<a@b>",
      subject: "Faktúra",
      sender: "Dodávateľ <a@b>",
      timestamp: "2026-11-20T08:00:00.000Z",
      preview: "Splatnosť zajtra",
      bodyText: "Celý text",
      sourceAccount: "tomas.kocner@wofevents.com",
      url: "",
      important: false,
      triageState: "ARCHIVED",
      triageFolder: "",
      secret: "do not return",
    })).toEqual({
      id: "imap:tomas.kocner@wofevents.com:<a@b>",
      threadId: "<a@b>",
      subject: "Faktúra",
      sender: "Dodávateľ <a@b>",
      timestamp: "2026-11-20T08:00:00.000Z",
      preview: "Splatnosť zajtra",
      bodyText: "Celý text",
      sourceAccount: "tomas.kocner@wofevents.com",
      url: "",
      important: false,
      triageState: "ARCHIVED",
      triageFolder: "",
    })
  })

  it("omits an absent triage state instead of inventing one", () => {
    const email = toBriefingEmail({
      id: "gmail-1", threadId: "gmail-1", subject: "Ahoj", sender: "nora@example.com",
      timestamp: "2026-11-20T08:00:00.000Z", preview: "Text", url: "https://mail.google.com/mail/u/0/#inbox/gmail-1",
      important: true,
    })
    expect(email.triageState).toBeUndefined()
    expect(email).not.toHaveProperty("bodyText")
  })
})
