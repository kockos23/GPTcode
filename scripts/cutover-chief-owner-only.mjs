import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const key = process.env.N8N_API_KEY
if (!base || !key) throw new Error("Missing n8n runtime configuration")
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent())
const api = async (path, init = {}) => {
  const response = await fetch(base + path, { ...init, headers: { "X-N8N-API-KEY": key, "content-type": "application/json" } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

const targets = [
  ["976VfstjatIijTZx", "Convex — ulož NORA úlohu"],
  ["oY8DseG5Q6q1eOhY", "Convex — ulož WOF Events správu"],
  ["oHAYAp6AOqbBRCuf", "Convex — ulož WOF Expo správu"],
]
const results = []
for (const [workflowId, legacyNode] of targets) {
  const workflow = await api(`/api/v1/workflows/${workflowId}`)
  if (!workflow.active) throw new Error(`Refusing inactive workflow: ${workflow.name}`)
  const ownerNode = `${legacyNode} — Owner Convex`
  if (!workflow.nodes.some(node => node.name === ownerNode)) throw new Error(`Owner node missing: ${workflow.name}`)
  const nodes = workflow.nodes.filter(node => node.name !== legacyNode)
  const connections = structuredClone(workflow.connections)
  delete connections[legacyNode]
  for (const connection of Object.values(connections)) {
    connection.main = (connection.main ?? []).map(group => (group ?? []).filter(edge => edge.node !== legacyNode))
  }
  await api(`/api/v1/workflows/${workflowId}`, { method: "PUT", body: JSON.stringify({ name: workflow.name, nodes, connections, settings: workflow.settings ?? {} }) })
  const verified = await api(`/api/v1/workflows/${workflowId}`)
  if (!verified.active || verified.nodes.some(node => node.name === legacyNode) || !verified.nodes.some(node => node.name === ownerNode)) throw new Error(`Cutover verification failed: ${workflow.name}`)
  results.push({ id: workflowId, name: workflow.name, active: verified.active, removed: legacyNode })
}
console.log(JSON.stringify(results))
