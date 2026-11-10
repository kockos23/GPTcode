import crypto from "node:crypto"

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "")
const apiKey = process.env.N8N_API_KEY
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "")
if (!base || !apiKey || !site) throw new Error("Missing n8n/Convex runtime configuration")

const api = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": apiKey, "content-type": "application/json", ...(options.headers || {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

const [probe, source, bank, workflowList] = await Promise.all([
  api("/api/v1/workflows/GYjLHpte4wi3g06L"),
  api("/api/v1/workflows/ajAP0czttC0c9syg"),
  api("/api/v1/workflows/Rog0Z5TIQ6qSpzFX"),
  api("/api/v1/workflows?limit=100"),
])
const convexCredentials = probe.nodes.find((node) => node.name === "Convex — Billdu zoznam 10 dokladov")?.credentials
const sourceValidation = source.nodes.find((node) => node.name === "Validuj a zaraď podľa dodania")?.parameters?.jsCode || ""
const folderMap = sourceValidation.match(/const folderMap = (\{[\s\S]*?\n\});/)?.[1]
if (!convexCredentials || !folderMap) throw new Error("Could not reuse verified credentials/folder map")

const normalizeName = "Normalizuj vystavené Billdu faktúry"
const uploadName = "Drive — nahraj Billdu PDF"
const claimName = "Convex — claim Billdu import"
const upload = structuredClone(source.nodes.find((node) => node.name === "Nahraj do mesačného priečinka"))
const sheet = structuredClone(source.nodes.find((node) => node.name === "Zapíš zaradený doklad do registra"))
if (!upload || !sheet) throw new Error("Could not reuse verified Drive/Sheets nodes")
upload.id = crypto.randomUUID(); upload.name = uploadName; upload.position = [1260, 0]
upload.parameters.name = `={{ $('${normalizeName}').item.json.fileName }}`
upload.parameters.folderId.value = `={{ $('${normalizeName}').item.json.targetFolderId }}`
sheet.id = crypto.randomUUID(); sheet.name = "Sheets — zapíš Billdu faktúru"; sheet.position = [1500, 0]
for (const [key, value] of Object.entries(sheet.parameters.columns.value)) {
  if (typeof value === "string") {
    sheet.parameters.columns.value[key] = value
      .replaceAll("$('Validuj a zaraď podľa dodania')", `$('${normalizeName}')`)
      .replaceAll("$('Nahraj do mesačného priečinka')", `$('${uploadName}')`)
  }
}

const normalizeCode = `const folderMap=${folderMap};
const productionCutover=Date.parse('2026-11-10T12:20:00Z');
const root=$json.data||{};
const rows=Array.isArray(root?._embedded?.items)?root._embedded.items:[];
const clean=v=>String(v??'').trim();
const iso=v=>{const s=clean(v).slice(0,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:''};
const amount=v=>{const s=clean(v).replace(/\\s/g,'');const n=Number(s.includes(',')&&!s.includes('.')?s.replace(',','.'):s);return Number.isFinite(n)?n:null};
const safe=v=>clean(v).replace(/[\\/:*?"<>|]/g,'-').replace(/[\\r\\n]/g,' ').slice(0,100);
const out=[];
for(const row of rows){
 const sourceDocumentId=clean(row.id), invoiceNumber=clean(row.serial_number), status=clean(row.status).toLowerCase();
 const createdAt=Date.parse(clean(row.created));
 const deliveryDate=iso(row.delivery_date), issueDate=iso(row.issue_date), dueDate=iso(row.due_date), currency=clean(row.currency).toUpperCase(), totalAmount=amount(row.total_price), sourceVersion=clean(row.modified||row.updated||row.created);
 const accountingPeriod=deliveryDate.slice(0,7), targetFolderId=folderMap[accountingPeriod]?.Vystavene_FA||'', customer=clean(row.client)||'Billdu klient';
 if(!Number.isFinite(createdAt)||createdAt<productionCutover||status!=='exposed'||!sourceDocumentId||!sourceVersion||!invoiceNumber||!deliveryDate||!targetFolderId||!^[A-Z]{3}$/.test(currency)||totalAmount===null||totalAmount<0)continue;
 const processedAt=new Date().toISOString();
 out.push({json:{sourceDocumentId,sourceVersion,id:'WOF-billdu-'+sourceDocumentId,documentKey:'billdu:'+sourceDocumentId,invoiceNumber,sourceStatus:status,status:'Zaradené',type:'invoice',deliveryDate,docDate:issueDate,dueDate,currency,totalAmount,customer,supplier:customer,accountingPeriod,targetFolderId,fileName:[deliveryDate,safe(customer),safe(invoiceNumber),totalAmount.toFixed(2),currency].join('_').slice(0,180)+'.pdf',processedAt,updatedAt:processedAt,source:'billdu',sourceMessageId:sourceDocumentId,sha256:'',docType:'Vystavená faktúra',destination:'Vystavene_FA',ico:'',dic:'',icDph:'',variableSymbol:clean(row.vs),netAmount:null,vatAmount:null,routeReady:true,reviewReason:'',description:'Import z Billdu; stav '+status,originalFileName:'billdu-'+sourceDocumentId+'.pdf',runId:String($execution.id),extractionVersion:'billdu-api-v1'}});
}
return out.sort((a,b)=>b.json.deliveryDate.localeCompare(a.json.deliveryDate));`

const nodes = [
  { id: crypto.randomUUID(), name: "Billdu — twice daily", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "cronExpression", expression: "12 7,17 * * *" }] } } },
  { id: crypto.randomUUID(), name: "Convex — načítaj Billdu faktúry", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [220, 0], credentials: convexCredentials, parameters: { method: "POST", url: `${site}/integrations/n8n/billdu/documents`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify({page:1,limit:100}) }}", options: {} } },
  { id: crypto.randomUUID(), name: normalizeName, type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 0], parameters: { jsCode: normalizeCode } },
  { id: crypto.randomUUID(), name: claimName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [700, 0], credentials: convexCredentials, parameters: { method: "POST", url: `${site}/integrations/n8n/billdu/imports/claim`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify({sourceDocumentId:$json.sourceDocumentId,sourceVersion:$json.sourceVersion,invoiceNumber:$json.invoiceNumber,deliveryDate:$json.deliveryDate,currency:$json.currency,totalAmount:$json.totalAmount}) }}`, options: {} } },
  { id: crypto.randomUUID(), name: "Pokračuj iba s novým importom", type: "n8n-nodes-base.code", typeVersion: 2, position: [900, 0], parameters: { jsCode: `if($json.ok!==true)throw new Error('Billdu claim zlyhal'); if($json.status!=='CLAIMED')return []; return $input.all();` } },
  { id: crypto.randomUUID(), name: "Convex — stiahni Billdu PDF", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [1080, 0], credentials: convexCredentials, parameters: { method: "POST", url: `${site}/integrations/n8n/billdu/documents/download`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify({id:$('${normalizeName}').item.json.sourceDocumentId}) }}`, options: { response: { response: { responseFormat: "file", outputPropertyName: "data" } } } } },
  upload,
  sheet,
  { id: crypto.randomUUID(), name: "Convex — dokonči Billdu import", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [1740, 0], credentials: convexCredentials, parameters: { method: "POST", url: `${site}/integrations/n8n/billdu/imports/complete`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify({sourceDocumentId:$('${normalizeName}').item.json.sourceDocumentId,sourceVersion:$('${normalizeName}').item.json.sourceVersion,attempt:$('${claimName}').item.json.attempts,ok:true,driveFileId:$('${uploadName}').item.json.id,driveFileUrl:'https://drive.google.com/file/d/'+$('${uploadName}').item.json.id+'/view',registerDocumentId:$('${normalizeName}').item.json.id}) }}`, options: {} } },
]
const connections = {}
for (let index = 0; index < nodes.length - 1; index++) connections[nodes[index].name] = { main: [[{ node: nodes[index + 1].name, type: "main", index: 0 }]] }
const settings = { ...bank.settings, timezone: "Europe/Bratislava", errorWorkflow: "cmGxWnoZh613XRWTF7o09", saveDataSuccessExecution: "none", saveDataErrorExecution: "all", saveExecutionProgress: false, executionTimeout: 900 }
const name = "SARA v2 — Billdu Issued Invoices"
const existing = workflowList.data.find((workflow) => workflow.name === name)
const payload = { name, nodes, connections, settings }
const workflow = existing
  ? await api(`/api/v1/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) })
  : await api("/api/v1/workflows", { method: "POST", body: JSON.stringify(payload) })
const activated = workflow.active ? workflow : await api(`/api/v1/workflows/${workflow.id}/activate`, { method: "POST", body: "{}" })
console.log(JSON.stringify({ id: activated.id, name: activated.name, active: activated.active, nodeCount: activated.nodes.length, cron: "12 7,17 * * *" }))
