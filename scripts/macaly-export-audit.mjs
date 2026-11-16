import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"

const input = process.argv[2]
if (!input) {
  console.error("Usage: npm run macaly:audit -- <macaly-export.zip|directory>")
  process.exit(1)
}

const repoRoot = process.cwd()
const source = resolve(input)
if (!existsSync(source)) {
  console.error(`Macaly export not found: ${source}`)
  process.exit(1)
}

const temporary = extname(source).toLowerCase() === ".zip" ? mkdtempSync(join(tmpdir(), "macaly-audit-")) : null

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim())
  return result.stdout
}

function safeArchiveEntries(zipPath) {
  const entries = run("unzip", ["-Z1", zipPath]).split(/\r?\n/).filter(Boolean)
  const unsafe = entries.filter(entry => {
    const normalized = entry.replaceAll("\\", "/")
    return normalized.startsWith("/") || normalized.split("/").includes("..") || /^[A-Za-z]:/.test(normalized)
  })
  if (unsafe.length) throw new Error(`Unsafe archive paths detected (${unsafe.length}). Export was not extracted.`)
  return entries
}

function directories(root, depth = 0) {
  if (depth > 3) return []
  const found = existsSync(join(root, "package.json")) ? [root] : []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["node_modules", ".git", ".output", "dist", "build"].includes(entry.name)) continue
    found.push(...directories(join(root, entry.name), depth + 1))
  }
  return found
}

const ignoredSegments = new Set(["node_modules", ".git", ".output", "dist", "build", "coverage", ".macaly", ".sandbox"])
const sensitiveNames = new Set([".env", ".env.local", ".env.production", ".env.development", ".npmrc"])
const rootFiles = new Set(["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "vitest.config.ts", "vitest.setup.ts", "components.json"])
const includedRoots = new Set(["src", "public", "convex", "docs", "n8n", "scripts", ".github"])

function listFiles(root, current = root) {
  const files = []
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name)
    const rel = relative(root, absolute).split(sep).join("/")
    const segments = rel.split("/")
    if (segments.some(segment => ignoredSegments.has(segment))) continue
    if (entry.isDirectory()) files.push(...listFiles(root, absolute))
    else if (entry.isFile() && (includedRoots.has(segments[0]) || (segments.length === 1 && rootFiles.has(entry.name)))) files.push(rel)
  }
  return files
}

function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

try {
  let exportRoot = source
  let archiveEntries = []
  if (temporary) {
    archiveEntries = safeArchiveEntries(source)
    run("unzip", ["-q", source, "-d", temporary])
    const candidates = directories(temporary)
    if (candidates.length !== 1) throw new Error(`Expected one Macaly project in archive, found ${candidates.length}.`)
    exportRoot = candidates[0]
  } else {
    const candidates = directories(source)
    if (candidates.length === 1) exportRoot = candidates[0]
    else if (!existsSync(join(source, "package.json"))) throw new Error(`Expected one Macaly project directory, found ${candidates.length}.`)
  }

  const discoveredSensitive = (archiveEntries.length ? archiveEntries : readdirSync(exportRoot)).filter(entry => sensitiveNames.has(basename(entry)))
  const exported = new Set(listFiles(exportRoot))
  const repository = new Set(listFiles(repoRoot))
  const added = [...exported].filter(file => !repository.has(file)).sort()
  const changed = [...exported].filter(file => repository.has(file) && digest(join(exportRoot, file)) !== digest(join(repoRoot, file))).sort()
  const repositoryOnly = [...repository].filter(file => !exported.has(file)).sort()

  console.log(`Macaly export: ${exportRoot}`)
  console.log(`Compared files: ${exported.size}`)
  console.log(`Changed: ${changed.length} | New in Macaly: ${added.length} | Repository only: ${repositoryOnly.length}`)
  if (discoveredSensitive.length) console.log(`Ignored sensitive files: ${[...new Set(discoveredSensitive.map(basename))].join(", ")}`)
  const print = (title, values) => {
    if (!values.length) return
    console.log(`\n${title}`)
    for (const value of values) console.log(`  ${value}`)
  }
  print("Changed files", changed)
  print("New files in Macaly export", added)
  print("Files only in repository (never auto-delete)", repositoryOnly)
  console.log("\nAudit only: no file was copied, deleted, or staged.")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true })
}
