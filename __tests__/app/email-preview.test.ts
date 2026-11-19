import { describe, expect, it } from "vitest"
import { cleanEmailPreview, emailPreviewForCard, uniqueDisplayEmails } from "../../src/lib/email-preview"

describe("email preview formatting", () => {
  it("keeps normal plain text readable", () => {
    expect(cleanEmailPreview("  Faktúra je splatná zajtra.\nProsím uhraďte ju. ")).toBe("Faktúra je splatná zajtra. Prosím uhraďte ju.")
  })

  it("extracts readable text and decodes entities from HTML", () => {
    expect(cleanEmailPreview("<!doctype html><html><head><style>.x{color:red}</style></head><body><h1>Pripomienka&nbsp;faktúry</h1><p>Suma: 25&nbsp;&euro;</p></body></html>"))
      .toBe("Pripomienka faktúry • Suma: 25 €")
  })

  it("replaces markup-only truncated email with a safe explanation", () => {
    expect(cleanEmailPreview('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><table style="width:100%"><tr><td></td></tr></table>'))
      .toBe("HTML e-mail – celý obsah otvoríš bezpečne v Gmaili.")
  })

  it("creates bounded card text", () => {
    expect(emailPreviewForCard("abcdefghij", 7)).toBe("abcdef…")
  })

  it("removes exact cross-source duplicates but keeps distinct timestamps", () => {
    const base = { sender:"Webglobe.sk", subject:"Faktúra", timestamp:"2026-11-19T10:00:00Z", preview:"<p>Text</p>" }
    expect(uniqueDisplayEmails([{...base,id:"imap:1"},{...base,id:"gmail:1"},{...base,id:"imap:2",timestamp:"2026-11-19T11:00:00Z"}]).map(item=>item.id))
      .toEqual(["imap:1","imap:2"])
  })
})
