import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
if (!base || !apiKey) throw new Error("Missing N8N_BASE_URL or N8N_API_KEY")

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent())
}

const targets = [
  ["Ux7URco0Z1YGmvgB", "12 7,17 * * *", "12 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["JcLXUmhJ0Kevytvi", "15 7,17 * * *", "15 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["R0bTgnf4bcPX41tG", "18 7,17 * * *", "18 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["OXvMtU4eUHGuGqw2", "22 7,17 * * *", "22 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["kp5UV1ZLKe5XjPWP", "27 7,17 * * *", "27 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["Rog0Z5TIQ6qSpzFX", "30 7,17 * * *", "30 13,14,15,16,17,18,19,20,21,22,23 * * *"],
  ["2YGEEBjYBn8aNBsY", "35 7,17 * * *", "35 13,14,15,16,17,18,19,20,21,22,23 * * *"],
]

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": apiKey, "content-type": "application/json", ...(options.headers || {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : null
}

function scheduleNodes(workflow) {
  return workflow.nodes.filter((node) => node.type === "n8n-nodes-base.scheduleTrigger")
}

function scheduleOf(workflow) {
  const nodes = scheduleNodes(workflow)
  if (nodes.length !== 1) throw new Error(`${workflow.name} must have exactly one schedule trigger`)
  const intervals = nodes[0].parameters?.rule?.interval
  if (!Array.isArray(intervals) || intervals.length !== 1 || typeof intervals[0].expression !== "string") {
    throw new Error(`${workflow.name} has an unsupported schedule shape`)
  }
  return intervals[0].expression
}

function updatePayload(workflow, expression) {
  const nodes = structuredClone(workflow.nodes)
  const schedule = nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger")
  schedule.parameters.rule.interval[0].expression = expression
  return { name: workflow.name, nodes, connections: workflow.connections, settings: workflow.settings }
}

const workflows = new Map()
for (const [id, target, temporary] of targets) {
  const workflow = await api(`/api/v1/workflows/${id}`)
  const current = scheduleOf(workflow)
  if (!workflow.active) throw new Error(`${workflow.name} is unexpectedly inactive`)
  if (current !== target && current !== temporary) {
    throw new Error(`${workflow.name} has unexpected schedule ${current}`)
  }
  workflows.set(id, { workflow, current, target })
}

const changed = []
try {
  for (const [id, { workflow, current, target }] of workflows) {
    if (current === target) continue
    const updated = await api(`/api/v1/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(updatePayload(workflow, target)),
    })
    if (!updated.active || scheduleOf(updated) !== target) throw new Error(`${workflow.name} update verification failed`)
    changed.push(id)
  }
} catch (error) {
  for (const id of changed.reverse()) {
    const { workflow, current } = workflows.get(id)
    await api(`/api/v1/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(updatePayload(workflow, current)),
    }).catch(() => null)
  }
  throw error
}

console.log(JSON.stringify({ changed: changed.length, verified: targets.length, active: true }))
