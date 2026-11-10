import crypto from "node:crypto"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "")
if (!base || !apiKey || !site) throw new Error("Missing n8n/Convex runtime configuration")

const api = async (path, options = {}) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { "X-N8N-API-KEY": apiKey, "content-type": "application/json", ...(options.headers || {}) },
    })
    const text = await response.text()
    if (response.ok) return text ? JSON.parse(text) : null
    if (response.status !== 401 || attempt === 3) {
      throw new Error(`${path}: ${response.status} ${text.slice(0, 500)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 750))
  }
}

const [controlCenter, probe, workflowList] = await Promise.all([
  api("/api/v1/workflows/976VfstjatIijTZx"),
  api("/api/v1/workflows/GYjLHpte4wi3g06L"),
  api("/api/v1/workflows?limit=100"),
])
const sheetsCredentials = controlCenter.nodes.find((node) => node.credentials?.googleSheetsOAuth2Api)?.credentials
const convexCredentials = probe.nodes.find((node) => node.credentials?.httpHeaderAuth)?.credentials
if (!sheetsCredentials || !convexCredentials) throw new Error("Required production credentials are not attached")

const spreadsheetId = "17_KPHzy339SO53_ov-Cpg-KscfsYwr-iMkK5ZnmSGEk"
const ranges = ["'Agent Registry'!A1:L20", "'Agent Work Queue'!A1:S100", "'Tasks & Reminders'!A1:O200", "'Command Inbox'!A1:P200"]
const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&")
const code = `const ranges=Array.isArray($json.valueRanges)?$json.valueRanges:[];
const rows=i=>Array.isArray(ranges[i]?.values)?ranges[i].values.slice(1):[];
const text=(row,i)=>String(row?.[i]??'');
const agents=rows(0).map(row=>({id:text(row,0),name:text(row,1),role:text(row,2),connection:text(row,3),status:text(row,4),lastCheck:text(row,5),currentTask:text(row,6),nextStep:text(row,9),owner:text(row,10),notes:text(row,11)})).filter(x=>x.id);
const workQueue=rows(1).map(row=>({id:text(row,0),projectId:text(row,1),title:text(row,2),owner:text(row,3),priority:text(row,5),status:text(row,6),updated:text(row,8),deadline:text(row,9),expectedOutput:text(row,11),result:text(row,12),nextAgent:text(row,13),approval:text(row,14),error:text(row,17),notes:text(row,18)})).filter(x=>x.id);
const tasks=rows(2).map(row=>({id:text(row,0),created:text(row,1),source:text(row,2),title:text(row,3),details:text(row,4),projectId:text(row,5),owner:text(row,6),priority:text(row,7),status:text(row,8),deadline:text(row,9),reminder:text(row,10),recurrence:text(row,11),related:text(row,12),result:text(row,13),updated:text(row,14)})).filter(x=>x.id);
const commands=rows(3).map(row=>({id:text(row,0),received:text(row,1),channel:text(row,2),contextType:text(row,4),contextId:text(row,5),command:text(row,6),intent:text(row,7),targetApp:text(row,8),approval:text(row,9),status:text(row,10),agent:text(row,11),result:text(row,12),error:text(row,13),runId:text(row,14),updated:text(row,15)})).filter(x=>x.id);
return [{json:{calendar:[],emails:[],agents,workQueue,tasks,commands,sourceErrors:['Google Calendar čaká na natívne OAuth pripojenie vlastníka','Chief of Staff Gmail briefing čaká na samostatné OAuth pripojenie vlastníka'],syncedAt:Date.now()}}];`

const nodes = [
  { id: crypto.randomUUID(), name: "Chief of Staff sync — twice daily", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "cronExpression", expression: "5 7,17 * * *" }] } } },
  { id: crypto.randomUUID(), name: "Sheets — načítaj Control Center", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [240, 0], credentials: sheetsCredentials, parameters: { method: "GET", url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, authentication: "predefinedCredentialType", nodeCredentialType: "googleSheetsOAuth2Api", options: {} } },
  { id: crypto.randomUUID(), name: "Normalizuj Chief of Staff snapshot", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 0], parameters: { jsCode: code } },
  { id: crypto.randomUUID(), name: "Convex — synchronizuj Chief of Staff", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [720, 0], credentials: convexCredentials, parameters: { method: "POST", url: `${site}/integrations/n8n/chief-of-staff/snapshot`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json) }}", options: {} } },
]
const connections = {}
for (let index = 0; index < nodes.length - 1; index++) connections[nodes[index].name] = { main: [[{ node: nodes[index + 1].name, type: "main", index: 0 }]] }
const settings = { executionOrder: "v1", timezone: "Europe/Bratislava", errorWorkflow: "kGkyEMhtp7qdGtFI", saveDataSuccessExecution: "none", saveDataErrorExecution: "all", saveExecutionProgress: false, executionTimeout: 900, callerPolicy: "workflowsFromSameOwner" }
async function upsert(name, workflowNodes, workflowConnections, workflowSettings) {
  const existing = workflowList.data.find((workflow) => workflow.name === name)
  const payload = { name, nodes: workflowNodes, connections: workflowConnections, settings: workflowSettings }
  return existing
    ? api(`/api/v1/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : api("/api/v1/workflows", { method: "POST", body: JSON.stringify(payload) })
}

const workflow = await upsert("NORA — Chief of Staff Snapshot Sync", nodes, connections, settings)

const healthNodes = [
  { id: crypto.randomUUID(), name: "Chief of Staff health — twice daily", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "cronExpression", expression: "45 7,17 * * *" }] } } },
  { id: crypto.randomUUID(), name: "Convex — over čerstvosť Chief of Staff", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [260, 0], credentials: convexCredentials, parameters: { method: "GET", url: `${site}/integrations/n8n/chief-of-staff/health`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", options: {} } },
]
const healthConnections = { [healthNodes[0].name]: { main: [[{ node: healthNodes[1].name, type: "main", index: 0 }]] } }
const health = await upsert("NORA — Chief of Staff Health Monitor", healthNodes, healthConnections, settings)

console.log(JSON.stringify({
  sync: { id: workflow.id, active: workflow.active, nodeCount: workflow.nodes.length, cron: "5 7,17 * * *" },
  health: { id: health.id, active: health.active, nodeCount: health.nodes.length, cron: "45 7,17 * * *" },
}))
