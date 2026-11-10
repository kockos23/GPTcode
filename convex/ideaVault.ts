import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import {
  DEFAULT_IDEA_PROFILE,
  IDEA_CATEGORIES,
  IDEA_STAGES,
  aggregateThemes,
  analysisStatusFor,
  buildProfilePrompt,
  cleanText,
  emptyEnrichment,
  isAuthorizedIngest,
  matchesSearch,
  normalizeCaptureInput,
  normalizeDigest,
  normalizeEnrichment,
  normalizeProfile,
  type IdeaProfile,
} from "./ideaVaultLogic"

const PROFILE_KEY = "owner"
const DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("UNAUTHENTICATED")
  const user = await ctx.db.get(userId)
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
  const email = user?.email?.trim().toLowerCase()
  if (!ownerEmail || !email || email !== ownerEmail) throw new Error("FORBIDDEN")
  return userId
}

async function loadProfile(ctx: QueryCtx | MutationCtx): Promise<IdeaProfile & { isDefault: boolean; updatedAt: number | null }> {
  const stored = await ctx.db
    .query("ideaProfile")
    .withIndex("by_profile_key", (q) => q.eq("profileKey", PROFILE_KEY))
    .unique()
  if (!stored) return { ...DEFAULT_IDEA_PROFILE, isDefault: true, updatedAt: null }
  return {
    focusAreas: stored.focusAreas,
    activeProjects: stored.activeProjects,
    goals: stored.goals,
    openQuestions: stored.openQuestions,
    avoid: stored.avoid,
    isDefault: false,
    updatedAt: stored.updatedAt,
  }
}

async function writeProfile(ctx: MutationCtx, profile: IdeaProfile) {
  const existing = await ctx.db
    .query("ideaProfile")
    .withIndex("by_profile_key", (q) => q.eq("profileKey", PROFILE_KEY))
    .unique()
  const doc = { profileKey: PROFILE_KEY, ...profile, updatedAt: Date.now() }
  if (existing) await ctx.db.patch(existing._id, doc)
  else await ctx.db.insert("ideaProfile", doc)
}

function publicCapture(capture: Doc<"ideaCaptures">) {
  const { _id, _creationTime, extractedText, ...rest } = capture
  return { ...rest, id: _id as string, hasExtractedText: Boolean(extractedText) }
}

// ---------------------------------------------------------------------------
// Internal functions used by the authenticated n8n HTTP endpoints
// ---------------------------------------------------------------------------

export const getAnalysisContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await loadProfile(ctx)
    const since = Date.now() - 90 * DAY
    const recentDocs = await ctx.db
      .query("ideaCaptures")
      .withIndex("by_received_at", (q) => q.gte("receivedAt", since))
      .order("desc")
      .take(300)
    const live = recentDocs.filter((c) => c.stage !== "archive")
    const themes = aggregateThemes(live, since)
    const recent = live
      .filter((c) => c.analysisStatus !== "failed")
      .slice(0, 40)
      .map((c) => ({ id: c._id as string, title: c.title, category: c.category, tags: c.tags }))
    const { isDefault: _isDefault, updatedAt: _updatedAt, ...profileData } = profile
    return {
      profile: profileData,
      themes,
      recent,
      categories: [...IDEA_CATEGORIES],
      promptContext: buildProfilePrompt(profileData, themes, recent),
    }
  },
})

export const upsertCapture = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, { payload }) => {
    const parsed = normalizeCaptureInput(payload)
    if (!parsed.ok) return { ok: false as const, errors: parsed.errors }
    const input = parsed.value

    const existing = await ctx.db
      .query("ideaCaptures")
      .withIndex("by_source_key", (q) => q.eq("sourceKey", input.sourceKey))
      .unique()

    const rawEnrichment = (payload as { enrichment?: unknown }).enrichment
    const hasEnrichment = Boolean(rawEnrichment && typeof rawEnrichment === "object")
    const recent = hasEnrichment
      ? await ctx.db.query("ideaCaptures").withIndex("by_received_at").order("desc").take(300)
      : []
    const normalized = hasEnrichment
      ? normalizeEnrichment(rawEnrichment, { allowedRelatedIds: recent.map((c) => c._id as string), selfId: existing?._id })
      : { enrichment: emptyEnrichment(input), issues: [] as string[] }
    const analysisError = cleanText((payload as { analysisError?: unknown }).analysisError, 300)
    const issues = [...normalized.issues, ...(analysisError ? [analysisError] : [])]
    const analysisStatus = analysisStatusFor(hasEnrichment, normalized.issues)
    const enrichment = { ...normalized.enrichment }
    if (!enrichment.title) enrichment.title = emptyEnrichment(input).title

    const now = Date.now()
    const fields = {
      ...input,
      fileName: input.fileName || undefined,
      mimeType: input.mimeType || undefined,
      telegramFileId: input.telegramFileId || undefined,
      driveFileId: input.driveFileId || undefined,
      driveUrl: input.driveUrl || undefined,
      extractedText: input.extractedText || undefined,
      ...enrichment,
      analysisStatus,
      analysisIssues: issues,
      updatedAt: now,
    }

    if (existing) {
      // Retry of the same Telegram message: refresh the analysis, keep the owner's curation.
      if (existing.analysisStatus === "ok" && analysisStatus !== "ok") {
        return { ok: true as const, id: existing._id as string, duplicate: true, analysisStatus: existing.analysisStatus, title: existing.title }
      }
      await ctx.db.patch(existing._id, fields)
      return { ok: true as const, id: existing._id as string, duplicate: true, analysisStatus, title: enrichment.title }
    }

    const id = await ctx.db.insert("ideaCaptures", {
      ...fields,
      stage: enrichment.category === "Úloha" ? "action" : "inbox",
      starred: false,
      createdAt: now,
    })
    return { ok: true as const, id: id as string, duplicate: false, analysisStatus, title: enrichment.title }
  },
})

export const getDigestInput = internalQuery({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const periodEnd = Date.now()
    const periodStart = periodEnd - Math.max(1, Math.min(31, days)) * DAY
    const captures = await ctx.db
      .query("ideaCaptures")
      .withIndex("by_received_at", (q) => q.gte("receivedAt", periodStart))
      .order("desc")
      .take(200)
    const profile = await loadProfile(ctx)
    const { isDefault: _isDefault, updatedAt: _updatedAt, ...profileData } = profile
    const items = captures
      .filter((c) => c.stage !== "archive" && c.analysisStatus !== "failed")
      .map((c) => ({
        id: c._id as string,
        title: c.title,
        category: c.category,
        summary: c.summary,
        keyPoints: c.keyPoints.slice(0, 4),
        frameworks: c.frameworks.map((f) => f.name),
        businessIdeas: c.businessIdeas.map((b) => b.title),
        relevanceScore: c.relevanceScore,
        tags: c.tags,
        starred: c.starred,
        userNote: c.userNote ?? "",
      }))
    return {
      periodStart,
      periodEnd,
      captureCount: items.length,
      items,
      promptContext: buildProfilePrompt(profileData, aggregateThemes(captures, periodStart), []),
    }
  },
})

export const saveDigest = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, { payload }) => {
    const p = (payload ?? {}) as Record<string, unknown>
    const periodStart = Number(p.periodStart)
    const periodEnd = Number(p.periodEnd)
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodEnd <= periodStart) {
      return { ok: false as const, errors: ["Neplatné obdobie digestu"] }
    }
    const captures = await ctx.db
      .query("ideaCaptures")
      .withIndex("by_received_at", (q) => q.gte("receivedAt", periodStart))
      .take(300)
    const { digest, issues } = normalizeDigest(p.digest, captures.map((c) => c._id as string))
    if (!digest.summary) return { ok: false as const, errors: issues }
    const digestKey = "digest:" + new Date(periodEnd).toISOString().slice(0, 10)
    const existing = await ctx.db
      .query("ideaDigests")
      .withIndex("by_digest_key", (q) => q.eq("digestKey", digestKey))
      .unique()
    const doc = { digestKey, periodStart, periodEnd, ...digest, captureCount: Number(p.captureCount) || 0, createdAt: Date.now() }
    if (existing) await ctx.db.replace(existing._id, doc)
    else await ctx.db.insert("ideaDigests", doc)
    return { ok: true as const, digestKey, issues }
  },
})

// ---------------------------------------------------------------------------
// Owner-only functions for the dashboard
// ---------------------------------------------------------------------------

export const listCaptures = query({
  args: {
    stage: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    starredOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const stage = args.stage && (IDEA_STAGES as readonly string[]).includes(args.stage) ? args.stage : null
    const docs = stage
      ? await ctx.db.query("ideaCaptures").withIndex("by_stage_received_at", (q) => q.eq("stage", stage)).order("desc").take(300)
      : await ctx.db.query("ideaCaptures").withIndex("by_received_at").order("desc").take(300)
    const search = cleanText(args.search, 120)
    return docs
      .filter((c) => !args.category || c.category === args.category)
      .filter((c) => !args.starredOnly || c.starred)
      .filter((c) => matchesSearch(c, search))
      .slice(0, 150)
      .map(publicCapture)
  },
})

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx)
    const since = Date.now() - 30 * DAY
    const recent = await ctx.db.query("ideaCaptures").withIndex("by_received_at").order("desc").take(500)
    const counts = Object.fromEntries(IDEA_STAGES.map((s) => [s, 0])) as Record<string, number>
    for (const c of recent) counts[c.stage] = (counts[c.stage] ?? 0) + 1
    const signals = recent
      .filter((c) => c.profileSignals.length && c.stage !== "archive")
      .slice(0, 20)
      .flatMap((c) => c.profileSignals.map((signal) => ({ captureId: c._id as string, captureTitle: c.title, signal })))
      .slice(0, 8)
    const digest = await ctx.db.query("ideaDigests").withIndex("by_created_at").order("desc").first()
    return {
      counts,
      failed: recent.filter((c) => c.analysisStatus === "failed").length,
      themes: aggregateThemes(recent, since, 10),
      signals,
      digest: digest ? (({ _id, _creationTime, ...rest }) => ({ ...rest, id: _id as string }))(digest) : null,
      profile: await loadProfile(ctx),
    }
  },
})

export const updateCapture = mutation({
  args: {
    id: v.id("ideaCaptures"),
    stage: v.optional(v.string()),
    starred: v.optional(v.boolean()),
    userNote: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const capture = await ctx.db.get(args.id)
    if (!capture) throw new Error("Záznam neexistuje")
    const patch: Partial<Doc<"ideaCaptures">> = { updatedAt: Date.now() }
    if (args.stage !== undefined) {
      if (!(IDEA_STAGES as readonly string[]).includes(args.stage)) throw new Error("Neplatný stav")
      patch.stage = args.stage
    }
    if (args.category !== undefined) {
      if (!(IDEA_CATEGORIES as readonly string[]).includes(args.category)) throw new Error("Neplatná kategória")
      patch.category = args.category
    }
    if (args.starred !== undefined) patch.starred = args.starred
    if (args.userNote !== undefined) patch.userNote = cleanText(args.userNote, 2000)
    await ctx.db.patch(args.id, patch)
  },
})

export const saveProfile = mutation({
  args: {
    focusAreas: v.array(v.string()),
    activeProjects: v.array(v.string()),
    goals: v.array(v.string()),
    openQuestions: v.array(v.string()),
    avoid: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    await writeProfile(ctx, normalizeProfile(args))
  },
})

// Owner confirms that a pattern the agent noticed really belongs to the profile (or dismisses it).
export const resolveProfileSignal = mutation({
  args: { captureId: v.id("ideaCaptures"), signal: v.string(), accept: v.boolean() },
  handler: async (ctx, { captureId, signal, accept }) => {
    await requireOwner(ctx)
    const capture = await ctx.db.get(captureId)
    if (!capture) throw new Error("Záznam neexistuje")
    await ctx.db.patch(captureId, {
      profileSignals: capture.profileSignals.filter((s) => s !== signal),
      updatedAt: Date.now(),
    })
    if (!accept) return
    const { isDefault: _isDefault, updatedAt: _updatedAt, ...profile } = await loadProfile(ctx)
    await writeProfile(ctx, normalizeProfile({ ...profile, focusAreas: [...profile.focusAreas, signal] }))
  },
})

// ---------------------------------------------------------------------------
// HTTP endpoints for n8n (Authorization: Bearer IDEA_VAULT_INGEST_TOKEN)
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function authorized(request: Request) {
  return isAuthorizedIngest(request.headers.get("Authorization"), {
    tokenSha256: process.env.IDEA_VAULT_INGEST_TOKEN_SHA256,
    token: process.env.IDEA_VAULT_INGEST_TOKEN,
  })
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > 200_000) throw new Error("Payload je príliš veľký")
  return JSON.parse(text)
}

export const httpContext = httpAction(async (ctx, request) => {
  if (!(await authorized(request))) return json({ ok: false, error: "UNAUTHORIZED" }, 401)
  return json({ ok: true, ...(await ctx.runQuery(internal.ideaVault.getAnalysisContext, {})) })
})

export const httpCapture = httpAction(async (ctx, request) => {
  if (!(await authorized(request))) return json({ ok: false, error: "UNAUTHORIZED" }, 401)
  let payload: unknown
  try { payload = await readJson(request) } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Neplatný JSON" }, 400)
  }
  const result = await ctx.runMutation(internal.ideaVault.upsertCapture, { payload })
  return json(result, result.ok ? 200 : 422)
})

export const httpDigestInput = httpAction(async (ctx, request) => {
  if (!(await authorized(request))) return json({ ok: false, error: "UNAUTHORIZED" }, 401)
  const days = Number(new URL(request.url).searchParams.get("days") ?? 7)
  return json({ ok: true, ...(await ctx.runQuery(internal.ideaVault.getDigestInput, { days: Number.isFinite(days) ? days : 7 })) })
})

export const httpDigest = httpAction(async (ctx, request) => {
  if (!(await authorized(request))) return json({ ok: false, error: "UNAUTHORIZED" }, 401)
  let payload: unknown
  try { payload = await readJson(request) } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Neplatný JSON" }, 400)
  }
  const result = await ctx.runMutation(internal.ideaVault.saveDigest, { payload })
  return json(result, result.ok ? 200 : 422)
})
