import crypto from "node:crypto"
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
if (!base || !apiKey) throw new Error("Missing N8N_BASE_URL or N8N_API_KEY")

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent())
}

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

const sourceWorkflow = await api("/api/v1/workflows/976VfstjatIijTZx")
const ownerSource = sourceWorkflow.nodes.find((node) => node.name === "Store Calendar Draft")
const ownerChatId = String(ownerSource?.parameters?.jsCode || "").match(/const ownerChat=["'](-?\d+)["']/)?.[1]
const telegramSource = sourceWorkflow.nodes.find((node) =>
  node.type === "n8n-nodes-base.telegram" && node.credentials?.telegramApi,
)
if (!ownerChatId || !telegramSource?.credentials) throw new Error("Owner Telegram configuration is unavailable")

const webhookName = "Prijmi podpísanú OTP požiadavku"
const validateName = "Convex — over OTP podpis"
const sendName = "Telegram — pošli prihlasovací kód"
const nodes = [
  {
    id: crypto.randomUUID(),
    webhookId: crypto.randomUUID(),
    name: webhookName,
    type: "n8n-nodes-base.webhook",
    typeVersion: 2.1,
    position: [0, 0],
    parameters: {
      httpMethod: "POST",
      path: "chief-of-staff-owner-otp",
      responseMode: "lastNode",
      options: {},
    },
  },
  {
    id: crypto.randomUUID(),
    name: validateName,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [260, 0],
    parameters: {
      method: "POST",
      url: "https://calm-alligator-455.eu-west-1.convex.site/auth/otp-delivery/validate",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.body ?? $json) }}",
      options: { timeout: 30_000 },
    },
  },
  {
    id: crypto.randomUUID(),
    name: sendName,
    type: "n8n-nodes-base.telegram",
    typeVersion: telegramSource.typeVersion,
    position: [520, 0],
    credentials: telegramSource.credentials,
    parameters: {
      chatId: ownerChatId,
      text: "={{ '🔐 Chief of Staff HQ\\nPrihlasovací kód: ' + $json.token + '\\nPlatí 15 minút.' }}",
      additionalFields: { appendAttribution: false },
    },
  },
]
const connections = {
  [webhookName]: { main: [[{ node: validateName, type: "main", index: 0 }]] },
  [validateName]: { main: [[{ node: sendName, type: "main", index: 0 }]] },
}
const settings = {
  executionOrder: "v1",
  timezone: "Europe/Bratislava",
  errorWorkflow: "kGkyEMhtp7qdGtFI",
  saveDataSuccessExecution: "none",
  saveDataErrorExecution: "all",
  saveExecutionProgress: false,
  executionTimeout: 60,
  callerPolicy: "workflowsFromSameOwner",
}

const name = "NORA — Owner OTP Delivery"
const list = await api("/api/v1/workflows?limit=100")
const existing = list.data.find((workflow) => workflow.name === name)
const payload = { name, nodes, connections, settings }
const workflow = existing
  ? await api(`/api/v1/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) })
  : await api("/api/v1/workflows", { method: "POST", body: JSON.stringify(payload) })

if (workflow.active) await api(`/api/v1/workflows/${workflow.id}/deactivate`, { method: "POST" })
const active = await api(`/api/v1/workflows/${workflow.id}/activate`, { method: "POST" })
console.log(JSON.stringify({ id: active.id, name: active.name, active: active.active, nodeCount: active.nodes.length }))
