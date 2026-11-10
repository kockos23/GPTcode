// Pure logic for the Idea Vault (osobný „second brain“ agent).
// No Convex imports here, so the rules stay unit-testable and reusable from HTTP handlers.

export const IDEA_SOURCES = ["telegram", "email", "manual"] as const
export type IdeaSource = (typeof IDEA_SOURCES)[number]

export const IDEA_KINDS = ["text", "link", "image", "document", "voice", "video", "other"] as const
export type IdeaKind = (typeof IDEA_KINDS)[number]

export const IDEA_CATEGORIES = [
  "Know-how",
  "Framework",
  "Biznis nápad",
  "Nástroj",
  "Inšpirácia",
  "Referencia",
  "Úloha",
] as const
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]

export const IDEA_STAGES = ["inbox", "library", "action", "archive"] as const
export type IdeaStage = (typeof IDEA_STAGES)[number]

export type AnalysisStatus = "ok" | "partial" | "failed"

export type IdeaFramework = { name: string; whenToUse: string; steps: string[] }
export type IdeaBusinessIdea = { title: string; problem: string; audience: string; firstStep: string }

export type IdeaEnrichment = {
  title: string
  summary: string
  category: IdeaCategory
  keyPoints: string[]
  frameworks: IdeaFramework[]
  businessIdeas: IdeaBusinessIdea[]
  relevanceScore: number
  relevanceWhy: string
  linkedFocus: string[]
  nextActions: string[]
  tags: string[]
  relatedCaptureIds: string[]
  profileSignals: string[]
}

export type IdeaProfile = {
  focusAreas: string[]
  activeProjects: string[]
  goals: string[]
  openQuestions: string[]
  avoid: string[]
}

export type CaptureInput = {
  sourceKey: string
  source: IdeaSource
  kind: IdeaKind
  receivedAt: number
  rawText: string
  caption: string
  urls: string[]
  fileName: string
  mimeType: string
  telegramFileId: string
  driveFileId: string
  driveUrl: string
  extractedText: string
}

export const LIMITS = {
  rawText: 8000,
  extractedText: 20000,
  shortText: 300,
  longText: 1500,
  listItems: 8,
  tags: 8,
  frameworks: 3,
  frameworkSteps: 8,
  businessIdeas: 3,
  urls: 10,
  relatedIds: 5,
} as const

// Default profile seeded from the Chief of Staff project register. The owner edits it in the UI.
export const DEFAULT_IDEA_PROFILE: IdeaProfile = {
  focusAreas: [
    "WOF Alliance – eventy, rast aliancie a partneri",
    "WOF Event Platform a networking produkt",
    "AI agentúra / coaching – produktizovaný AI workflow audit",
    "Malé SaaS portfólio a rýchla validácia nápadov",
    "Akvizície firiem a acquisition scorecard",
    "AI agenti a Chief of Staff systém",
    "Osobný operačný systém (RPM), šport a zdravie",
  ],
  activeProjects: [
    "Rome 2027 (AGM WOF Alliance)",
    "WOF CRM & web ecosystem",
    "WOF Growth Agent",
    "Vyzuj papuče – stratégia a sponzoring",
  ],
  goals: [
    "Nájsť prvú predajnú AI ponuku s jasným výstupom",
    "Zjednotiť dáta a procesy WOF",
  ],
  openQuestions: [
    "Ktorou AI ponukou začať a pre aký segment?",
    "Aký rozsah má mať MVP Event Platform?",
  ],
  avoid: [],
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

export function cleanText(value: unknown, max: number = LIMITS.longText): string {
  if (typeof value !== "string") return ""
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, max)
}

export function cleanList(value: unknown, maxItems: number = LIMITS.listItems, maxLength: number = LIMITS.shortText): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const text = cleanText(item, maxLength)
    const key = text.toLocaleLowerCase("sk")
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

export function normalizeTag(value: string): string {
  return value
    .toLocaleLowerCase("sk")
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
}

export function normalizeTags(value: unknown): string[] {
  const tags = cleanList(value, LIMITS.tags * 2, 60).map(normalizeTag).filter(Boolean)
  return [...new Set(tags)].slice(0, LIMITS.tags)
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  const urls: string[] = []
  for (const match of matches) {
    const trimmed = match.replace(/[.,;:!?]+$/, "")
    try {
      const url = new URL(trimmed)
      if (url.protocol !== "http:" && url.protocol !== "https:") continue
      if (!urls.includes(url.toString())) urls.push(url.toString())
    } catch {
      // ignore malformed links
    }
    if (urls.length >= LIMITS.urls) break
  }
  return urls
}

export function inferKind(input: { mimeType?: string; text?: string; hasFile?: boolean }): IdeaKind {
  const mime = (input.mimeType ?? "").toLowerCase()
  if (mime.startsWith("audio/")) return "voice"
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime) return "document"
  if (input.hasFile) return "other"
  if (extractUrls(input.text ?? "").length) return "link"
  return "text"
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function normalizeCaptureInput(raw: unknown):
  | { ok: true; value: CaptureInput }
  | { ok: false; errors: string[] } {
  const r = record(raw)
  const errors: string[] = []
  const sourceKey = cleanText(r.sourceKey, 200)
  if (!/^[a-z]+:[\w:.-]+$/i.test(sourceKey)) errors.push("sourceKey musí mať tvar <zdroj>:<id>")
  const source = oneOf(r.source, IDEA_SOURCES)
  if (!source) errors.push("Neplatný source")

  const rawText = cleanText(r.rawText, LIMITS.rawText)
  const caption = cleanText(r.caption, LIMITS.longText)
  const mimeType = cleanText(r.mimeType, 100).toLowerCase()
  const telegramFileId = cleanText(r.telegramFileId, 300)
  const driveFileId = cleanText(r.driveFileId, 200)
  const providedUrls = Array.isArray(r.urls) ? r.urls.filter((u): u is string => typeof u === "string") : []
  const urls = extractUrls([...providedUrls, rawText, caption].join(" "))
  const kind = oneOf(r.kind, IDEA_KINDS) ?? inferKind({
    mimeType,
    text: rawText + " " + caption,
    hasFile: Boolean(telegramFileId || driveFileId),
  })

  const receivedRaw = typeof r.receivedAt === "number" ? r.receivedAt : Date.parse(String(r.receivedAt ?? ""))
  const receivedAt = Number.isFinite(receivedRaw) && receivedRaw > 0
    ? (receivedRaw < 1e12 ? receivedRaw * 1000 : receivedRaw)
    : Date.now()

  const extractedText = cleanText(r.extractedText, LIMITS.extractedText)
  if (!rawText && !caption && !urls.length && !telegramFileId && !driveFileId && !extractedText) {
    errors.push("Záznam neobsahuje text, odkaz ani súbor")
  }
  if (errors.length || !source) return { ok: false, errors }

  const driveUrlRaw = cleanText(r.driveUrl, 500)
  const driveUrl = /^https:\/\/(drive|docs)\.google\.com\//.test(driveUrlRaw) ? driveUrlRaw : ""

  return {
    ok: true,
    value: {
      sourceKey,
      source,
      kind,
      receivedAt,
      rawText,
      caption,
      urls,
      fileName: cleanText(r.fileName, 200),
      mimeType,
      telegramFileId,
      driveFileId,
      driveUrl,
      extractedText,
    },
  }
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.max(0, Math.min(100, n)))
}

export function fallbackTitle(input: Pick<CaptureInput, "rawText" | "caption" | "urls" | "fileName" | "kind">): string {
  const text = (input.caption || input.rawText).replace(/https?:\/\/\S+/g, "").trim()
  if (text) return text.split(/\n/)[0].slice(0, 90)
  if (input.urls[0]) {
    try { return new URL(input.urls[0]).hostname.replace(/^www\./, "") } catch { /* fall through */ }
  }
  if (input.fileName) return input.fileName.slice(0, 90)
  const labels: Record<IdeaKind, string> = {
    text: "Poznámka", link: "Odkaz", image: "Obrázok", document: "Dokument",
    voice: "Hlasová poznámka", video: "Video", other: "Súbor",
  }
  return labels[input.kind]
}

export function normalizeEnrichment(
  raw: unknown,
  options: { allowedRelatedIds?: Iterable<string>; selfId?: string } = {},
): { enrichment: IdeaEnrichment; issues: string[] } {
  const r = record(raw)
  const issues: string[] = []
  const allowed = new Set(options.allowedRelatedIds ?? [])

  const title = cleanText(r.title, 120)
  if (!title) issues.push("Chýba názov")
  const summary = cleanText(r.summary, LIMITS.longText)
  if (!summary) issues.push("Chýba zhrnutie")
  const category = oneOf(r.category, IDEA_CATEGORIES)
  if (!category) issues.push("Neplatná kategória")

  const frameworks: IdeaFramework[] = (Array.isArray(r.frameworks) ? r.frameworks : [])
    .map((item) => {
      const f = record(item)
      return {
        name: cleanText(f.name, 120),
        whenToUse: cleanText(f.whenToUse, LIMITS.shortText),
        steps: cleanList(f.steps, LIMITS.frameworkSteps),
      }
    })
    .filter((f) => f.name && f.steps.length)
    .slice(0, LIMITS.frameworks)

  const businessIdeas: IdeaBusinessIdea[] = (Array.isArray(r.businessIdeas) ? r.businessIdeas : [])
    .map((item) => {
      const b = record(item)
      return {
        title: cleanText(b.title, 120),
        problem: cleanText(b.problem, LIMITS.shortText),
        audience: cleanText(b.audience, LIMITS.shortText),
        firstStep: cleanText(b.firstStep, LIMITS.shortText),
      }
    })
    .filter((b) => b.title && b.problem)
    .slice(0, LIMITS.businessIdeas)

  const relatedCaptureIds = cleanList(r.relatedCaptureIds, LIMITS.relatedIds * 2, 64)
    .filter((id) => id !== options.selfId && (allowed.size === 0 ? false : allowed.has(id)))
    .slice(0, LIMITS.relatedIds)

  return {
    issues,
    enrichment: {
      title,
      summary,
      category: category ?? "Referencia",
      keyPoints: cleanList(r.keyPoints),
      frameworks,
      businessIdeas,
      relevanceScore: clampScore(r.relevanceScore),
      relevanceWhy: cleanText(r.relevanceWhy, LIMITS.shortText),
      linkedFocus: cleanList(r.linkedFocus, 5, 160),
      nextActions: cleanList(r.nextActions, 5),
      tags: normalizeTags(r.tags),
      relatedCaptureIds,
      profileSignals: cleanList(r.profileSignals, 3, 160),
    },
  }
}

export function emptyEnrichment(input: Pick<CaptureInput, "rawText" | "caption" | "urls" | "fileName" | "kind">): IdeaEnrichment {
  return {
    title: fallbackTitle(input),
    summary: "",
    category: "Referencia",
    keyPoints: [],
    frameworks: [],
    businessIdeas: [],
    relevanceScore: 0,
    relevanceWhy: "",
    linkedFocus: [],
    nextActions: [],
    tags: [],
    relatedCaptureIds: [],
    profileSignals: [],
  }
}

// Decides analysis status: complete analysis is "ok", usable but incomplete is "partial",
// no usable AI output is "failed" (the raw capture is still kept – nothing is ever dropped).
export function analysisStatusFor(enrichmentProvided: boolean, issues: string[]): AnalysisStatus {
  if (!enrichmentProvided) return "failed"
  if (issues.includes("Chýba názov") && issues.includes("Chýba zhrnutie")) return "failed"
  return issues.length ? "partial" : "ok"
}

export function normalizeProfile(raw: unknown): IdeaProfile {
  const r = record(raw)
  return {
    focusAreas: cleanList(r.focusAreas, 20, 200),
    activeProjects: cleanList(r.activeProjects, 20, 200),
    goals: cleanList(r.goals, 12, 200),
    openQuestions: cleanList(r.openQuestions, 12, 240),
    avoid: cleanList(r.avoid, 12, 200),
  }
}

export type ThemeCount = { tag: string; count: number }

export function aggregateThemes(captures: { tags: string[]; receivedAt: number }[], since: number, limit = 12): ThemeCount[] {
  const counts = new Map<string, number>()
  for (const capture of captures) {
    if (capture.receivedAt < since) continue
    for (const tag of capture.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

export type RecentCaptureRef = { id: string; title: string; category: string; tags: string[] }

// Text block that n8n injects into the analysis prompt, so the model knows who it works for.
export function buildProfilePrompt(profile: IdeaProfile, themes: ThemeCount[], recent: RecentCaptureRef[]): string {
  const section = (label: string, items: string[]) => items.length ? `${label}:\n${items.map((i) => "- " + i).join("\n")}` : ""
  const themeLine = themes.length ? "Opakujúce sa témy (posledných 90 dní): " + themes.map((t) => `${t.tag} (${t.count})`).join(", ") : ""
  const recentLines = recent.length
    ? "Nedávne záznamy (pre relatedCaptureIds použi iba tieto ID):\n" + recent.map((c) => `- [${c.id}] ${c.title} · ${c.category}${c.tags.length ? " · #" + c.tags.join(" #") : ""}`).join("\n")
    : "Nedávne záznamy: žiadne"
  return [
    section("Oblasti, ktorým sa venujem", profile.focusAreas),
    section("Aktívne projekty", profile.activeProjects),
    section("Ciele", profile.goals),
    section("Otázky, nad ktorými uvažujem", profile.openQuestions),
    section("Čo ma nezaujíma", profile.avoid),
    themeLine,
    recentLines,
  ].filter(Boolean).join("\n\n")
}

export function matchesSearch(
  capture: { title: string; summary: string; tags: string[]; rawText: string; caption: string; keyPoints: string[] },
  query: string,
): boolean {
  const terms = query.toLocaleLowerCase("sk").split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = [capture.title, capture.summary, capture.rawText, capture.caption, ...capture.tags, ...capture.keyPoints]
    .join(" ")
    .toLocaleLowerCase("sk")
  return terms.every((term) => haystack.includes(term.replace(/^#/, "")))
}

export type DigestTheme = { name: string; insight: string; captureIds: string[] }
export type IdeaDigest = {
  title: string
  summary: string
  themes: DigestTheme[]
  topActions: string[]
  businessBets: string[]
  questions: string[]
}

export function normalizeDigest(raw: unknown, allowedCaptureIds: Iterable<string>): { digest: IdeaDigest; issues: string[] } {
  const r = record(raw)
  const allowed = new Set(allowedCaptureIds)
  const issues: string[] = []
  const title = cleanText(r.title, 140)
  const summary = cleanText(r.summary, 2000)
  if (!title) issues.push("Chýba názov digestu")
  if (!summary) issues.push("Chýba zhrnutie digestu")
  const themes = (Array.isArray(r.themes) ? r.themes : [])
    .map((item) => {
      const t = record(item)
      return {
        name: cleanText(t.name, 120),
        insight: cleanText(t.insight, 600),
        captureIds: cleanList(t.captureIds, 12, 64).filter((id) => allowed.has(id)),
      }
    })
    .filter((t) => t.name && t.insight)
    .slice(0, 6)
  return {
    issues,
    digest: {
      title: title || "Týždenný prehľad nápadov",
      summary,
      themes,
      topActions: cleanList(r.topActions, 5),
      businessBets: cleanList(r.businessBets, 3),
      questions: cleanList(r.questions, 5),
    },
  }
}

// Constant-time comparison of equal-length strings, so checks do not leak secrets via timing.
export function timingSafeEqualText(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) {
    diff |= b.charCodeAt(i) ^ (a.charCodeAt(i % Math.max(a.length, 1)) || 0)
  }
  return diff === 0
}

function bearerToken(header: string | null | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

// Plain-secret check (secret stored as-is in the environment).
export function isAuthorizedBearer(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 24) return false
  const provided = bearerToken(header)
  return provided !== null && timingSafeEqualText(provided, secret)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Preferred check: the environment stores only the SHA-256 of the token, never the token itself.
export async function isAuthorizedIngest(
  header: string | null | undefined,
  config: { token?: string; tokenSha256?: string },
): Promise<boolean> {
  const expectedHash = config.tokenSha256?.trim().toLowerCase()
  if (expectedHash && /^[0-9a-f]{64}$/.test(expectedHash)) {
    const provided = bearerToken(header)
    if (!provided || provided.length < 24) return false
    return timingSafeEqualText(await sha256Hex(provided), expectedHash)
  }
  return isAuthorizedBearer(header, config.token)
}
