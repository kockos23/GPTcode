import crypto from "node:crypto"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "")
const workflowId = process.env.NORA_WORKFLOW_ID || "976VfstjatIijTZx"
if (!base || !apiKey || !site) throw new Error("Missing n8n/Convex runtime configuration")

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": apiKey, "content-type": "application/json", ...(options.headers || {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const [workflow, probe] = await Promise.all([
  api(`/api/v1/workflows/${workflowId}`),
  api("/api/v1/workflows/GYjLHpte4wi3g06L"),
])
const node = name => workflow.nodes.find(item => item.name === name)
const agent = node("NORA Agent")
const parser = node("ParseAgentOutput")
const sheetTask = node("Create Agent Task")
const actionable = node("Is Actionable Task")
const verifiedCredential = probe.nodes.find(item => item.credentials?.httpHeaderAuth)?.credentials
if (!agent || !parser || !sheetTask || !actionable || !verifiedCredential?.httpHeaderAuth) throw new Error("Required NORA nodes or Convex credential are missing")

const taskRule = `

Task capture rules:
- When Tomáš dictates or writes one or more tasks, set intent=CAPTURE and return every distinct task in tasks, in source order.
- Never merge a list into one vague task. Preserve dates, people, context and desired result per item.
- A single task still uses a one-element tasks array.
- deadline is YYYY-MM-DD when explicit or reliably relative to the live Bratislava clock; otherwise empty.
- suggestedAction is one of NONE, CALENDAR, REMINDER, DELEGATE, RESEARCH. Calendar creation remains separately owner-approved.
- The user-facing text confirms how many tasks were captured and briefly lists them.

Extend the strict JSON object with: "tasks":[{"title":"","details":"","priority":"URGENT|HIGH|NORMAL|LOW","deadline":"YYYY-MM-DD or empty","specialist":"COS|NORA|WOF_FIN|FIRMA2_FIN|WOF_OPS|NIKE_LOCAL|RESEARCH|BUILD_TECH","approvalRequired":false,"suggestedAction":"NONE|CALENDAR|REMINDER|DELEGATE|RESEARCH"}].`
if (!agent.parameters.options.systemMessage.includes("Task capture rules:")) agent.parameters.options.systemMessage += taskRule

if (!parser.parameters.jsCode.includes("tasks: Array.isArray(parsedData.tasks)")) {
  parser.parameters.jsCode = parser.parameters.jsCode.replace(
    "calendarEvents: Array.isArray(parsedData.calendarEvents) ? parsedData.calendarEvents : [],",
    "calendarEvents: Array.isArray(parsedData.calendarEvents) ? parsedData.calendarEvents : [],\n    tasks: Array.isArray(parsedData.tasks) ? parsedData.tasks.slice(0, 25) : [],",
  )
}

const splitName = "Rozdeľ diktované úlohy"
const persistName = "Convex — ulož NORA úlohu"
const splitNode = {
  id: "nora-split-dictated-tasks", name: splitName, type: "n8n-nodes-base.code", typeVersion: 2, position: [5056, 1456],
  parameters: { jsCode: `const source=$input.first().json;const owners=new Set(['COS','NORA','WOF_FIN','FIRMA2_FIN','WOF_OPS','NIKE_LOCAL','RESEARCH','BUILD_TECH']);const priorities={URGENT:'P0',HIGH:'P1',NORMAL:'P2',LOW:'P3'};const rows=Array.isArray(source.tasks)&&source.tasks.length?source.tasks:[{title:source.title,details:source.details,priority:source.priority,deadline:'',specialist:source.specialist,approvalRequired:source.approvalRequired,suggestedAction:'NONE'}];return rows.slice(0,25).map((row,index)=>({json:{...source,taskId:'Q-'+String(source.commandId||Date.now()).replace(/^CMD-/,'')+'-'+(index+1),taskTitle:String(row?.title||source.title||'Úloha').trim().slice(0,300),taskDetails:String(row?.details||'').trim().slice(0,5000),taskPriority:priorities[String(row?.priority||source.priority||'NORMAL').toUpperCase()]||'P2',taskDeadline:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(row?.deadline||''))?String(row.deadline):'',taskSpecialist:owners.has(String(row?.specialist||'').toUpperCase())?String(row.specialist).toUpperCase():source.specialist,taskApproval:row?.approvalRequired===true?'OWNER':'NONE',suggestedAction:String(row?.suggestedAction||'NONE').toUpperCase()}}));` },
}
const persistNode = {
  id: "nora-persist-task-convex", name: persistName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [5536, 1536], credentials: verifiedCredential,
  parameters: {
    method: "POST", url: `${site}/integrations/n8n/chief-of-staff/tasks`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify({taskId:$json.taskId,title:$json.taskTitle,details:$json.taskDetails,priority:$json.taskPriority,deadline:$json.taskDeadline||undefined,source:'Telegram',assignee:$json.taskSpecialist,approval:$json.taskApproval}) }}`,
    options: { timeout: 30000 },
  },
}

workflow.nodes = workflow.nodes.filter(item => ![splitName, persistName].includes(item.name)).concat(splitNode, persistNode)
const mapping = sheetTask.parameters.columns.value
mapping["Task ID"] = "={{ $json.taskId }}"
mapping["Názov úlohy"] = "={{ $json.taskTitle }}"
mapping["Owner agent"] = "={{ $json.taskSpecialist }}"
mapping["Priorita"] = "={{ $json.taskPriority }}"
mapping["Stav"] = "={{ $json.taskApproval === 'OWNER' ? 'ČAKÁ NA SCHVÁLENIE' : 'READY' }}"
mapping["Deadline"] = "={{ $json.taskDeadline }}"
mapping["Vstupy"] = "={{ $json.taskDetails || $json.rawText }}"
mapping["Očakávaný výstup"] = "={{ $json.taskDetails }}"
mapping["Approval gate"] = "={{ $json.taskApproval === 'OWNER' ? 'Tomáš schváli' : 'Nie' }}"

actionable.parameters.conditions = {
  options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
  conditions: [{ id: "nora-actionable-task", leftValue: "={{ ['CAPTURE','ROUTE'].includes($json.intent) ? 'YES' : 'NO' }}", rightValue: "YES", operator: { type: "string", operation: "equals" } }],
  combinator: "and",
}

workflow.connections["Is Actionable Task"] = { main: [[{ node: splitName, type: "main", index: 0 }], []] }
workflow.connections[splitName] = { main: [[
  { node: "Create Agent Task", type: "main", index: 0 },
  { node: persistName, type: "main", index: 0 },
]] }

const payload = { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings }
const saved = await api(`/api/v1/workflows/${workflowId}`, { method: "PUT", body: JSON.stringify(payload) })
console.log(JSON.stringify({ id: saved.id, active: saved.active, taskSplit: saved.nodes.some(item => item.name === splitName), convexPersist: saved.nodes.some(item => item.name === persistName) }))
