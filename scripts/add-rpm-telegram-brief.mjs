import { randomUUID } from "node:crypto"
import { rpmNodeCode } from "./rpm-brief-text.mjs"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const key = process.env.N8N_API_KEY
if (!base || !key) throw new Error("Missing n8n configuration")

async function workflow(id, body) {
  const response = await fetch(`${base}/api/v1/workflows/${id}`, {
    method: body ? "PUT" : "GET",
    headers: { "X-N8N-API-KEY": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`n8n HTTP ${response.status}`)
  return response.json()
}

const [sync, nora] = await Promise.all([
  workflow("ZSLQjHV7ofqoCPhb"),
  workflow("976VfstjatIijTZx"),
])
const save = "Convex — synchronizuj Chief of Staff"
const schedule = "Chief of Staff sync — twice daily"
const render = "RPM — zostav ranný briefing"
const send = "Telegram — ranný RPM briefing"
const telegram = nora.nodes.find(node => node.name === "SendResponse")
const chatId = nora.nodes.find(node => node.name === "Store Calendar Draft")
  ?.parameters.jsCode.match(/const ownerChat=["'](-?\d+)["'];/)?.[1]
if (!sync.active || sync.settings.timezone !== "Europe/Bratislava" || !chatId || !telegram?.credentials?.telegramApi ||
    ![save, schedule, "Normalizuj Chief of Staff snapshot"].every(name => sync.nodes.some(node => node.name === name))) {
  throw new Error("Unexpected production workflow layout")
}
const existing = sync.nodes.some(node => node.name === render) && sync.nodes.some(node => node.name === send)
if (!existing && (sync.nodes.some(node => [render, send].includes(node.name)) || sync.connections[save]?.main?.flat().length)) {
  throw new Error("Snapshot workflow already has downstream nodes")
}

const jsCode = rpmNodeCode(schedule)
const edge = node => ({ main: [[{ node, type: "main", index: 0 }]] })
const nodes = existing
  ? sync.nodes.map(node => node.name === render ? { ...node, parameters: { ...node.parameters, jsCode } } : node)
  : [...sync.nodes,
    { id: randomUUID(), name: render, type: "n8n-nodes-base.code", typeVersion: 2, position: [2220, 0], parameters: { jsCode } },
    { id: randomUUID(), name: send, type: telegram.type, typeVersion: telegram.typeVersion, position: [2440, 0],
      credentials: telegram.credentials, parameters: { resource: "message", operation: "sendMessage",
        chatId, text: "={{ $json.text }}", additionalFields: { appendAttribution: false, disable_web_page_preview: true } } },
  ]
const connections = existing ? sync.connections : { ...sync.connections, [save]: edge(render), [render]: edge(send) }
const saved = process.argv.includes("--apply")
  ? await workflow(sync.id, { name: sync.name, nodes, connections, settings: sync.settings }) : sync
console.log(JSON.stringify({ active: saved.active, applied: process.argv.includes("--apply") && saved.nodes.some(node => node.name === send), mode: existing ? "update" : "insert", time: "07:05 Europe/Bratislava" }))
