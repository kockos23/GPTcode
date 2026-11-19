import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const key = process.env.N8N_API_KEY
if (!base || !key) throw new Error("N8N_BASE_URL and N8N_API_KEY are required")
const origin = new URL(base)
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("N8N_BASE_URL must be an HTTPS origin")

async function api(path, init = {}) {
  const url = new URL(path, origin)
  if (url.origin !== origin.origin) throw new Error("Refusing cross-origin n8n request")
  const args = ["--fail-with-body", "--silent", "--show-error", "--header", `X-N8N-API-KEY: ${key}`, "--header", "Content-Type: application/json"]
  if (init.method) args.push("--request", init.method)
  if (init.body) args.push("--data-binary", "@-")
  args.push(url.href)
  try {
    const stdout = execFileSync("curl", args, { input: init.body ?? "", encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch (error) {
    const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr).slice(0, 300) : String(error)
    throw new Error(`n8n request failed: ${detail}`)
  }
}

const definitions = [
  ["NORA — WOF Events IMAP intake (PILOT)", "n8n/workflows/nora-wof-imap-events.pilot.json", "Normalizuj WOF Events správu"],
  ["NORA — WOF Expo IMAP intake (PILOT)", "n8n/workflows/nora-wof-imap-expo.pilot.json", "Normalizuj WOF Expo správu"],
]
const summaries = await api("/api/v1/workflows?limit=250")

for (const [workflowName, file, nodeName] of definitions) {
  const summary = summaries.data?.find(item => item.name === workflowName)
  if (!summary) throw new Error(`Workflow not found: ${workflowName}`)
  const [live, template] = await Promise.all([api(`/api/v1/workflows/${summary.id}`), readFile(file, "utf8").then(JSON.parse)])
  if (!live.active) throw new Error(`Refusing to update inactive workflow: ${workflowName}`)
  const source = template.nodes.find(node => node.name === nodeName)
  const target = live.nodes.find(node => node.name === nodeName)
  if (!source?.parameters?.jsCode || !target?.parameters?.jsCode) throw new Error(`Normalization node missing: ${workflowName}`)
  const nodes = live.nodes.map(node => node.name === nodeName
    ? { ...node, parameters: { ...node.parameters, jsCode: source.parameters.jsCode } }
    : node)
  await api(`/api/v1/workflows/${live.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: live.name, nodes, connections: live.connections, settings: live.settings ?? {} }),
  })
  const verified = await api(`/api/v1/workflows/${live.id}`)
  const verifiedCode = verified.nodes.find(node => node.name === nodeName)?.parameters?.jsCode
  if (verifiedCode !== source.parameters.jsCode || !verified.active) throw new Error(`Verification failed: ${workflowName}`)
  console.log(`UPDATED ${verified.id} ${verified.name} active=${verified.active}`)
}
