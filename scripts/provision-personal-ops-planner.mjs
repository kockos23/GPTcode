import fs from "node:fs"
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "")
if (!base || !apiKey || !site) throw new Error("Missing n8n/Convex runtime configuration")
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent())
const api = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "X-N8N-API-KEY": apiKey, "content-type": "application/json" } })
  const body = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.slice(0, 300)}`)
  return body ? JSON.parse(body) : null
}

const workflows = await api("/api/v1/workflows?limit=100")
const snapshotSummary = workflows.data.find(item => item.name === "NORA — Chief of Staff Snapshot Sync")
if (!snapshotSummary) throw new Error("Snapshot workflow not found; cannot reuse its Convex credential reference")
const snapshot = await api(`/api/v1/workflows/${snapshotSummary.id}`)
const convexCredentials = snapshot.nodes.find(node => node.credentials?.httpHeaderAuth)?.credentials
if (!convexCredentials) throw new Error("Convex Header Auth credential reference not found")

const template = JSON.parse(fs.readFileSync(new URL("../n8n/workflows/nora-personal-ops-planner.pilot.json", import.meta.url), "utf8"))
const excluded = new Set(["Pošli Personal Ops briefing"])
const nodes = template.nodes.filter(node => !excluded.has(node.name)).map(node => {
  const next = structuredClone(node)
  if (next.name === "Convex — navrhni plán") {
    next.disabled = false
    next.credentials = convexCredentials
    next.parameters.url = `${site}/integrations/n8n/personal-ops/planner`
  }
  if (next.name === "Convex — načítaj návrhy") {
    next.disabled = false
    next.credentials = convexCredentials
    next.parameters.url = `${site}/integrations/n8n/personal-ops/proposals?limit=20`
  }
  return next
})
const connections = structuredClone(template.connections)
delete connections["Priprav briefing návrhov"]
const name = "NORA — Personal Operations Planner"
const settings = { ...template.settings, errorWorkflow: snapshot.settings?.errorWorkflow, saveManualExecutions: false }
const payload = { name, nodes, connections, settings }
const existing = workflows.data.find(item => item.name === name)
const workflow = existing
  ? await api(`/api/v1/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) })
  : await api("/api/v1/workflows", { method: "POST", body: JSON.stringify(payload) })
if (!workflow.active) await api(`/api/v1/workflows/${workflow.id}/activate`, { method: "POST" })
const verified = await api(`/api/v1/workflows/${workflow.id}`)
console.log(JSON.stringify({ id: verified.id, active: verified.active, nodeCount: verified.nodes.length, telegramNodes: verified.nodes.filter(node => node.type === "n8n-nodes-base.telegram").length, schedules: ["30 6 * * *", "0 18 * * 0"] }))
