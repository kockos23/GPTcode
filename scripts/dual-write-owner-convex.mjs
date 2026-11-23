import crypto from "node:crypto"
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
if (!base || !apiKey) throw new Error("Missing N8N_BASE_URL or N8N_API_KEY")

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent())
}

const OWNER_SITE = "https://calm-alligator-455.eu-west-1.convex.site"
const OWNER_CREDENTIAL = {
  httpHeaderAuth: {
    id: "vSjKRxAIu96PWtVi",
    name: "Chief of Staff HQ — Owner Convex",
  },
}

const targets = [
  { workflowId: "976VfstjatIijTZx", nodeName: "Convex — ulož NORA úlohu" },
  { workflowId: "dgolcuNFPx46cP7j", nodeName: "Convex — over čerstvosť Chief of Staff" },
  { workflowId: "oHAYAp6AOqbBRCuf", nodeName: "Convex — ulož WOF Expo správu" },
  { workflowId: "oY8DseG5Q6q1eOhY", nodeName: "Convex — ulož WOF Events správu" },
]

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "X-N8N-API-KEY": apiKey,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

function attachParallelConnection(connections, originalName, cloneName) {
  let attached = false
  for (const connection of Object.values(connections)) {
    for (const outputs of Object.values(connection)) {
      if (!Array.isArray(outputs)) continue
      for (const targetsAtOutput of outputs) {
        if (!Array.isArray(targetsAtOutput)) continue
        const originalTargets = targetsAtOutput.filter((target) => target?.node === originalName)
        for (const target of originalTargets) {
          if (!targetsAtOutput.some((candidate) => candidate?.node === cloneName && candidate?.index === target.index)) {
            targetsAtOutput.push({ ...target, node: cloneName })
          }
          attached = true
        }
      }
    }
  }
  return attached
}

const results = []
for (const target of targets) {
  const workflow = await api(`/api/v1/workflows/${target.workflowId}`)
  const original = workflow.nodes.find((node) => node.name === target.nodeName)
  if (!original) throw new Error(`${workflow.name}: missing node ${target.nodeName}`)

  const cloneName = `${target.nodeName} — Owner Convex`
  let clone = workflow.nodes.find((node) => node.name === cloneName)
  const oldUrl = String(original.parameters?.url || "")
  if (!oldUrl.includes("coordinated-mongoose-77.eu-west-1.convex.site")) {
    throw new Error(`${workflow.name}: unexpected source URL for ${target.nodeName}`)
  }
  const ownerUrl = oldUrl.replace("https://coordinated-mongoose-77.eu-west-1.convex.site", OWNER_SITE)

  if (!clone) {
    clone = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      name: cloneName,
      position: [Number(original.position?.[0] || 0), Number(original.position?.[1] || 0) + 180],
    }
    workflow.nodes.push(clone)
  }
  clone.parameters = { ...clone.parameters, url: ownerUrl }
  clone.credentials = OWNER_CREDENTIAL

  if (!attachParallelConnection(workflow.connections, target.nodeName, cloneName)) {
    throw new Error(`${workflow.name}: could not find incoming connection for ${target.nodeName}`)
  }

  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings,
  }
  const updated = await api(`/api/v1/workflows/${workflow.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
  results.push({ id: updated.id, name: updated.name, active: updated.active, ownerNode: cloneName })
}

console.log(JSON.stringify(results, null, 2))
