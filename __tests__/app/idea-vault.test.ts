import { describe, expect, it } from "vitest"
import {
  DEFAULT_IDEA_PROFILE,
  aggregateThemes,
  analysisStatusFor,
  buildProfilePrompt,
  extractUrls,
  fallbackTitle,
  inferKind,
  isAuthorizedBearer,
  matchesSearch,
  normalizeCaptureInput,
  normalizeDigest,
  normalizeEnrichment,
  normalizeTags,
} from "../../convex/ideaVaultLogic"

describe("idea vault capture input", () => {
  it("accepts a Telegram link message and extracts clean URLs", () => {
    const result = normalizeCaptureInput({
      sourceKey: "telegram:12345:678",
      source: "telegram",
      rawText: "Pozri toto https://example.com/article?x=1, super framework.",
      receivedAt: 1_762_600_000,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe("link")
    expect(result.value.urls).toEqual(["https://example.com/article?x=1"])
    expect(result.value.receivedAt).toBe(1_762_600_000_000)
  })

  it("rejects payloads without an identity or any content", () => {
    const result = normalizeCaptureInput({ sourceKey: "bad key", source: "telegram" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("sourceKey musí mať tvar <zdroj>:<id>")
    expect(result.errors).toContain("Záznam neobsahuje text, odkaz ani súbor")
  })

  it("infers kind from mime type and drops non-Google drive links", () => {
    expect(inferKind({ mimeType: "audio/ogg" })).toBe("voice")
    expect(inferKind({ mimeType: "image/jpeg" })).toBe("image")
    expect(inferKind({ mimeType: "application/pdf" })).toBe("document")
    expect(inferKind({ text: "len myšlienka" })).toBe("text")
    const result = normalizeCaptureInput({
      sourceKey: "telegram:1:2", source: "telegram", telegramFileId: "AgAC",
      mimeType: "image/png", driveUrl: "https://evil.example.com/x",
    })
    expect(result.ok && result.value.kind).toBe("image")
    expect(result.ok && result.value.driveUrl).toBe("")
  })

  it("ignores javascript and malformed links", () => {
    expect(extractUrls("javascript:alert(1) https://ok.sk/a. http://")).toEqual(["https://ok.sk/a"])
  })
})

describe("idea vault enrichment", () => {
  const raw = {
    title: "Jobs to be Done pre eventy",
    summary: "Článok vysvetľuje JTBD a ako ho použiť pri návrhu eventov.",
    category: "Framework",
    keyPoints: ["Ľudia si „najímajú“ produkty", "Ľudia si „najímajú“ produkty", "Funkčný, emočný, sociálny job"],
    frameworks: [{ name: "JTBD", whenToUse: "Pri návrhu MVP", steps: ["Identifikuj job", "Zmapuj prekážky"] }, { name: "Bez krokov", steps: [] }],
    businessIdeas: [{ title: "JTBD audit pre eventy", problem: "Eventy nevedia, prečo ľudia prichádzajú", audience: "Organizátori", firstStep: "3 rozhovory" }],
    relevanceScore: 140,
    relevanceWhy: "Priamo k WOF Event Platform",
    tags: ["#JTBD", "Event Platform", "jtbd"],
    relatedCaptureIds: ["known", "unknown", "self"],
    profileSignals: ["Product discovery"],
  }

  it("normalizes, deduplicates and clamps the AI output", () => {
    const { enrichment, issues } = normalizeEnrichment(raw, { allowedRelatedIds: ["known", "self"], selfId: "self" })
    expect(issues).toEqual([])
    expect(enrichment.keyPoints).toHaveLength(2)
    expect(enrichment.frameworks).toHaveLength(1)
    expect(enrichment.relevanceScore).toBe(100)
    expect(enrichment.tags).toEqual(["jtbd", "event-platform"])
    expect(enrichment.relatedCaptureIds).toEqual(["known"])
    expect(analysisStatusFor(true, issues)).toBe("ok")
  })

  it("never invents related links when the allow-list is empty", () => {
    const { enrichment } = normalizeEnrichment(raw)
    expect(enrichment.relatedCaptureIds).toEqual([])
  })

  it("falls back to a safe category and marks broken output", () => {
    const { enrichment, issues } = normalizeEnrichment({ category: "Spam" })
    expect(enrichment.category).toBe("Referencia")
    expect(issues).toContain("Neplatná kategória")
    expect(analysisStatusFor(true, issues)).toBe("failed")
    expect(analysisStatusFor(true, ["Neplatná kategória"])).toBe("partial")
    expect(analysisStatusFor(false, [])).toBe("failed")
  })

  it("builds readable fallback titles", () => {
    expect(fallbackTitle({ rawText: "", caption: "", urls: ["https://www.lennysnewsletter.com/p/x"], fileName: "", kind: "link" })).toBe("lennysnewsletter.com")
    expect(fallbackTitle({ rawText: "", caption: "", urls: [], fileName: "", kind: "voice" })).toBe("Hlasová poznámka")
  })

  it("normalizes tags to slug form", () => {
    expect(normalizeTags(["#AI Agenti!", "ai agenti", "", 4])).toEqual(["ai-agenti"])
  })
})

describe("idea vault context and search", () => {
  it("aggregates recurring themes in the time window", () => {
    const themes = aggregateThemes([
      { tags: ["ai", "saas"], receivedAt: 10 },
      { tags: ["ai"], receivedAt: 20 },
      { tags: ["staré"], receivedAt: 1 },
    ], 5)
    expect(themes).toEqual([{ tag: "ai", count: 2 }, { tag: "saas", count: 1 }])
  })

  it("puts the owner profile and allowed IDs into the prompt", () => {
    const prompt = buildProfilePrompt(DEFAULT_IDEA_PROFILE, [{ tag: "ai", count: 3 }], [{ id: "abc", title: "AI audit", category: "Biznis nápad", tags: ["ai"] }])
    expect(prompt).toContain("WOF Event Platform")
    expect(prompt).toContain("ai (3)")
    expect(prompt).toContain("[abc] AI audit")
  })

  it("matches all search terms across title, tags and text", () => {
    const capture = { title: "Pricing stratégie", summary: "", tags: ["saas"], rawText: "value based", caption: "", keyPoints: [] }
    expect(matchesSearch(capture, "pricing #saas")).toBe(true)
    expect(matchesSearch(capture, "pricing crm")).toBe(false)
    expect(matchesSearch(capture, "  ")).toBe(true)
  })
})

describe("idea vault digest and auth", () => {
  it("keeps only digest themes pointing to real captures", () => {
    const { digest, issues } = normalizeDigest({
      title: "Týždeň 45",
      summary: "Veľa AI agentov.",
      themes: [{ name: "AI agenti", insight: "Opakuje sa téma agentov.", captureIds: ["a", "zzz"] }],
      topActions: ["Napísať ponuku"],
    }, ["a"])
    expect(issues).toEqual([])
    expect(digest.themes[0].captureIds).toEqual(["a"])
  })

  it("requires a long secret and an exact Bearer token", () => {
    const secret = "s".repeat(32)
    expect(isAuthorizedBearer("Bearer " + secret, secret)).toBe(true)
    expect(isAuthorizedBearer("Bearer " + secret + "x", secret)).toBe(false)
    expect(isAuthorizedBearer(secret, secret)).toBe(false)
    expect(isAuthorizedBearer("Bearer short", "short")).toBe(false)
    expect(isAuthorizedBearer(null, secret)).toBe(false)
  })
})
