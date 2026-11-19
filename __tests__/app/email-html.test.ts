import { describe, expect, it } from "vitest"
import { sanitizeEmailHtml } from "../../src/lib/email-html"

describe("safe email HTML", () => {
  it("removes executable and interactive content", () => {
    const result = sanitizeEmailHtml('<script>alert(1)</script><form><input></form><p onclick="bad()">Dobrý deň</p>')
    expect(result).not.toMatch(/script|form|input|onclick/i)
    expect(result).toContain("Dobrý deň")
  })

  it("blocks remote images by default", () => {
    const result = sanitizeEmailHtml('<img src="https://tracker.example/pixel.png" alt="Ponuka">')
    expect(result).not.toContain("https://tracker.example")
    expect(result).toContain("Vzdialený obrázok je zablokovaný")
  })

  it("allows remote images only after an explicit choice", () => {
    const result = sanitizeEmailHtml('<img src="https://cdn.example/image.png">', true)
    expect(result).toContain('src="https://cdn.example/image.png"')
  })

  it("neutralizes javascript links and remote CSS resources", () => {
    const result = sanitizeEmailHtml('<style>@import "https://bad";.x{background:url(https://pixel)}</style><a href="javascript:bad()">link</a>')
    expect(result).not.toMatch(/javascript:|@import|https:\/\/pixel/i)
    expect(result).toContain('href="#"')
  })
})
