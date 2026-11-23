import crypto from "node:crypto"
import { EnvHttpProxyAgent,setGlobalDispatcher } from "undici"

const base=process.env.N8N_BASE_URL?.replace(/\/$/,""),key=process.env.N8N_API_KEY
const site=(process.env.OWNER_CONVEX_SITE_URL||"https://calm-alligator-455.eu-west-1.convex.site").replace(/\/$/,"")
if(!base||!key)throw new Error("Missing n8n runtime configuration")
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.ALL_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent())
const api=async(path,init={})=>{const response=await fetch(base+path,{...init,headers:{"X-N8N-API-KEY":key,"content-type":"application/json"}});const text=await response.text();if(!response.ok)throw new Error(`${path}: ${response.status} ${text.slice(0,500)}`);return text?JSON.parse(text):null}
const list=await api("/api/v1/workflows?limit=250")
const byName=name=>list.data.find(row=>row.name===name)
const snapshotSummary=byName("NORA — Chief of Staff Snapshot Sync")
const noraSummary=byName("NORA – Chief of Staff (Telegram Voice+Text → Command Inbox)")
if(!snapshotSummary||!noraSummary)throw new Error("Required NORA source workflow missing")
const [snapshot,nora]=await Promise.all([api(`/api/v1/workflows/${snapshotSummary.id}`),api(`/api/v1/workflows/${noraSummary.id}`)])
const convexCredentials=snapshot.nodes.find(node=>
  node.credentials?.httpHeaderAuth?.name==="Chief of Staff HQ — Owner Convex"
)?.credentials
const gmailCredentials=snapshot.nodes.find(node=>node.credentials?.gmailOAuth2)?.credentials
const openAiCredentials=nora.nodes.find(node=>node.credentials?.openAiApi)?.credentials
if(!convexCredentials||!gmailCredentials||!openAiCredentials)throw new Error("Required owner production credential references missing")
const eventsSummary=byName("NORA — WOF Events IMAP intake (PILOT)")
if(!eventsSummary)throw new Error("WOF Events IMAP intake workflow missing")
const eventsWorkflow=await api(`/api/v1/workflows/${eventsSummary.id}`)
const eventsImapCredentials=eventsWorkflow.nodes.find(node=>node.type==="n8n-nodes-base.emailReadImap")?.credentials?.imap
if(!eventsImapCredentials)throw new Error("WOF Events IMAP credential reference missing")

const id=()=>crypto.randomUUID()
const http=(name,position,parameters,credentials=convexCredentials)=>({id:id(),name,type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position,credentials,parameters})
const code=(name,position,jsCode)=>({id:id(),name,type:"n8n-nodes-base.code",typeVersion:2,position,parameters:{jsCode}})
const iff=(name,position,leftValue,rightValue)=>({id:id(),name,type:"n8n-nodes-base.if",typeVersion:2.2,position,parameters:{conditions:{options:{caseSensitive:true,typeValidation:"strict",version:2},combinator:"and",conditions:[{id:id(),leftValue,rightValue,operator:{type:"string",operation:"equals"}}]},options:{}}})
const post=(url,body)=>({method:"POST",url,authentication:"genericCredentialType",genericAuthType:"httpHeaderAuth",sendBody:true,specifyBody:"json",jsonBody:`={{ JSON.stringify(${body}) }}`,options:{timeout:30000}})

const routeCode=`const command=$('Split commands').item.json;
const needsApproval=['CREATE_CALENDAR_EVENT','SAVE_ATTACHMENT_TO_DRIVE'].includes(command.intent)&&!command.approvalGranted;
const externalWofDraft=command.intent==='DRAFT_EMAIL_REPLY'&&String(command.contextId||'').startsWith('imap:tomas.kocner@wofevents.com:');
const route=needsApproval?'WAITING_APPROVAL':command.intent==='TRIAGE_EMAIL'?'TRIAGE':externalWofDraft?'IMAP_DRAFT':command.intent==='DRAFT_EMAIL_REPLY'?'DRAFT':'UNSUPPORTED';
return [{json:{...command,route}}];`
const prepareTriageCode=`const command=$('Route command').item.json;const parts=String(command.contextType||'').split('|');if(parts[0]!=='EmailTriage')throw new Error('Neplatný triage kontext');const decode=value=>{try{return decodeURIComponent(String(value||''))}catch{return ''}};const state=parts[1],folder=decode(parts[2]),previousFolder=decode(parts[3]),sourceAccount=decode(parts[4]);if(!['INBOX','ARCHIVED','MOVED'].includes(state))throw new Error('Neplatný cieľový stav');const customLabel=name=>name?'Chief HQ - '+name:'';return [{json:{command,state,folder,previousFolder,sourceAccount,targetLabel:customLabel(folder),previousLabel:customLabel(previousFolder),provider:'imap:'===String(command.contextId||'').slice(0,5)?'IMAP':'GMAIL'}}];`
const prepareGmailLabelsCode=`const triage=$('Prepare triage').item.json;const labels=Array.isArray($json.labels)?$json.labels:[];const byName=name=>labels.find(label=>label.name===name)?.id||'';const targetId=triage.state==='MOVED'?byName(triage.targetLabel):'';const previousId=triage.previousLabel?byName(triage.previousLabel):'';const createLabel=triage.state==='MOVED'&&!targetId;const addLabelIds=triage.state==='INBOX'?['INBOX']:targetId?[targetId]:[];const removeLabelIds=triage.state==='INBOX'?(previousId?[previousId]:[]):['INBOX'];return [{json:{...triage,createLabel,addLabelIds,removeLabelIds}}];`
const prepareCreatedLabelCode=`const prepared=$('Prepare Gmail labels').item.json;const id=String($json.id||'');if(!id)throw new Error('Gmail nevytvoril priečinok');return [{json:{...prepared,addLabelIds:[id]}}];`
const prepareImapMoveCode=`const triage=$('Prepare triage').item.json;const email=$json.email||{};const uid=String(email.providerUid||'').trim();if(!uid)throw new Error('Správa ešte nemá IMAP UID; obnov príjem pošty a skús znova');const targetMailbox=triage.state==='INBOX'?'INBOX':'Archive';const sourceMailbox=triage.state==='INBOX'?'Archive':'INBOX';return [{json:{...triage,emailUid:uid,sourceMailbox,targetMailbox}}];`
const prepareDraftCode=`const command=$('Route command').item.json;const message=$json||{};const headers=message.payload?.headers||[];const header=name=>String(headers.find(h=>String(h.name).toLowerCase()===name.toLowerCase())?.value||'');
const decode=value=>{try{return Buffer.from(String(value||'').replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')}catch{return ''}};
const parts=[];const walk=part=>{if(part?.body?.data)parts.push(decode(part.body.data));for(const child of part?.parts||[])walk(child)};walk(message.payload);
const source=parts.join('\n').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').slice(0,12000);
const from=header('Reply-To')||header('From'),subject=header('Subject')||'(bez predmetu)';
return [{json:{command,from,subject,messageId:header('Message-ID'),requestBody:{model:'gpt-5-mini',store:false,reasoning:{effort:'low'},max_output_tokens:1200,instructions:'Si NORA, profesionálna Chief of Staff asistentka. Napíš stručný, vecný a prirodzený draft odpovede v jazyku pôvodného e-mailu. Nič neposielaj, nevymýšľaj fakty a ak chýba rozhodnutie, označ ho hranatou poznámkou pre Tomáša.',input:[{role:'user',content:[{type:'input_text',text:'Pokyn: '+command.command+'\\n\\nPôvodný e-mail od '+from+', predmet '+subject+':\\n'+source}]}]}}}];`
const prepareGmailCode=`const prepared=$('Prepare draft prompt').item.json;const response=$json||{};const draft=String(response.output_text||response.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'').trim();if(!draft)throw new Error('OpenAI nevrátil text draftu');const email=(prepared.from.match(/<([^>]+)>/)||prepared.from.match(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/)||[])[1]||prepared.from;const subject=/^re:/i.test(prepared.subject)?prepared.subject:'Re: '+prepared.subject;const raw=['To: '+email,'Subject: '+subject,prepared.messageId?'In-Reply-To: '+prepared.messageId:'','Content-Type: text/plain; charset=UTF-8','',''+draft].filter(Boolean).join('\\r\\n');return [{json:{command:prepared.command,draft,raw:Buffer.from(raw).toString('base64url')}}];`
const prepareImapPromptCode=`const command=$('Route command').item.json;const email=$json.email||{};const strip=value=>String(value||'').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();const source=String(email.bodyText||strip(email.bodyHtml)||email.preview||'').slice(0,16000);if(!source)throw new Error('Pôvodný e-mail nemá čitateľný obsah');const from=String(email.sender||'').trim(),subject=String(email.subject||'(bez predmetu)').trim();return [{json:{command,email,from,subject,requestBody:{model:'gpt-5-mini',store:false,reasoning:{effort:'low'},max_output_tokens:1200,instructions:'Si NORA, profesionálna Chief of Staff asistentka. Napíš stručný, vecný a prirodzený draft odpovede v jazyku pôvodného e-mailu. Nič neposielaj, nevymýšľaj fakty a ak chýba rozhodnutie, označ ho hranatou poznámkou pre Tomáša.',input:[{role:'user',content:[{type:'input_text',text:'Pokyn: '+command.command+'\\n\\nPôvodný e-mail od '+from+', predmet '+subject+':\\n'+source}]}]}}}];`
const prepareImapDraftCode=`const prepared=$('Prepare WOF draft prompt').item.json;const response=$json||{};const draft=String(response.output_text||response.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'').trim();if(!draft)throw new Error('OpenAI nevrátil text draftu');const match=prepared.from.match(/<([^>]+)>/)||prepared.from.match(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/);const to=String(match?.[1]||match?.[0]||'').trim();if(!to)throw new Error('Nenašla sa adresa príjemcu');const subject=/^re:/i.test(prepared.subject)?prepared.subject:'Re: '+prepared.subject;return [{json:{command:prepared.command,draft,to,subject}}];`

const nodes=[
  {id:id(),name:"Command worker — every 2 minutes",type:"n8n-nodes-base.scheduleTrigger",typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:"cronExpression",expression:"*/2 * * * *"}]}}},
  http("Claim commands",[220,0],post(`${site}/integrations/n8n/chief-of-staff/commands/claim`,`{worker:'NORA_COMMAND_WORKER',limit:5}`)),
  {id:id(),name:"Split commands",type:"n8n-nodes-base.splitOut",typeVersion:1,position:[440,0],parameters:{fieldToSplitOut:"commands",options:{}}},
  http("Start command",[660,0],post(`${site}/integrations/n8n/chief-of-staff/commands/start`,`{commandId:$json.commandId,worker:'NORA_COMMAND_WORKER',attempt:$json.attempt}`)),
  code("Route command",[880,0],routeCode),
  iff("Needs owner approval?",[1100,0],"={{ $json.route }}","WAITING_APPROVAL"),
  http("Complete — waiting approval",[1340,-180],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$json.commandId,worker:'NORA_COMMAND_WORKER',attempt:$json.attempt,outcome:'WAITING_APPROVAL',result:'Akcia '+$json.targetApp+' je naplánovaná a čaká na schválenie vlastníka.'}`)),
  iff("Is email triage?",[1340,80],"={{ $json.route }}","TRIAGE"),
  code("Prepare triage",[1580,-320],prepareTriageCode),
  iff("Is Gmail triage?",[1810,-320],"={{ $json.provider }}","GMAIL"),
  http("Gmail — list labels",[2040,-440],{method:"GET",url:"https://gmail.googleapis.com/gmail/v1/users/me/labels",authentication:"predefinedCredentialType",nodeCredentialType:"gmailOAuth2",options:{timeout:30000}},gmailCredentials),
  code("Prepare Gmail labels",[2270,-440],prepareGmailLabelsCode),
  iff("Create Gmail label?",[2500,-440],"={{ String($json.createLabel) }}","true"),
  http("Gmail — create label",[2730,-560],{method:"POST",url:"https://gmail.googleapis.com/gmail/v1/users/me/labels",authentication:"predefinedCredentialType",nodeCredentialType:"gmailOAuth2",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify({name:$json.targetLabel,labelListVisibility:'labelShow',messageListVisibility:'show'}) }}",options:{timeout:30000}},gmailCredentials),
  code("Use created Gmail label",[2960,-560],prepareCreatedLabelCode),
  http("Gmail — apply triage",[3190,-440],{method:"POST",url:"=https://gmail.googleapis.com/gmail/v1/users/me/messages/{{$json.command.contextId}}/modify",authentication:"predefinedCredentialType",nodeCredentialType:"gmailOAuth2",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify({addLabelIds:$json.addLabelIds,removeLabelIds:$json.removeLabelIds}) }}",options:{timeout:30000}},gmailCredentials),
  http("Complete — Gmail triage",[3420,-440],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$('Prepare triage').item.json.command.commandId,worker:'NORA_COMMAND_WORKER',attempt:$('Prepare triage').item.json.command.attempt,outcome:'DONE',result:'Správa bola uprataná priamo v Gmaili.'}`)),
  http("Convex — load IMAP triage email",[2040,-200],post(`${site}/integrations/n8n/chief-of-staff/email/get`,`{emailKey:$json.command.contextId}`)),
  code("Prepare IMAP move",[2270,-200],prepareImapMoveCode),
  {id:id(),name:"WOF Events IMAP — move email",type:"n8n-nodes-imap-ai.imap",typeVersion:1,position:[2500,-200],credentials:{imap:eventsImapCredentials},parameters:{operation:"moveEmail",mailbox:{mode:"name",value:"={{ $json.sourceMailbox }}"},emailUid:"={{ $json.emailUid }}",targetMailbox:{mode:"name",value:"={{ $json.targetMailbox }}"}}},
  http("Complete — IMAP triage",[2730,-200],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$('Prepare triage').item.json.command.commandId,worker:'NORA_COMMAND_WORKER',attempt:$('Prepare triage').item.json.command.attempt,outcome:'DONE',result:'Správa bola presunutá priamo v schránke WOF Events.'}`)),
  iff("Is Gmail draft?",[1580,80],"={{ $json.route }}","DRAFT"),
  http("Gmail — load source message",[1580,-20],{method:"GET",url:"=https://gmail.googleapis.com/gmail/v1/users/me/messages/{{$json.contextId}}?format=full",authentication:"predefinedCredentialType",nodeCredentialType:"gmailOAuth2",options:{timeout:30000}},gmailCredentials),
  code("Prepare draft prompt",[1810,-20],prepareDraftCode),
  http("OpenAI — write draft",[2040,-20],{method:"POST",url:"https://api.openai.com/v1/responses",authentication:"predefinedCredentialType",nodeCredentialType:"openAiApi",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify($json.requestBody) }}",options:{timeout:60000}},openAiCredentials),
  code("Prepare Gmail draft",[2270,-20],prepareGmailCode),
  http("Gmail — create draft",[2500,-20],{method:"POST",url:"https://gmail.googleapis.com/gmail/v1/users/me/drafts",authentication:"predefinedCredentialType",nodeCredentialType:"gmailOAuth2",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify({message:{raw:$json.raw}}) }}",options:{timeout:30000}},gmailCredentials),
  http("Complete — draft ready",[2730,-20],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$('Prepare Gmail draft').item.json.command.commandId,worker:'NORA_COMMAND_WORKER',attempt:$('Prepare Gmail draft').item.json.command.attempt,outcome:'DONE',result:'Draft odpovede bol vytvorený v Gmaili. Draft ID: '+String($json.id||'')}`)),
  iff("Is WOF IMAP draft?",[1580,200],"={{ $json.route }}","IMAP_DRAFT"),
  http("Convex — load WOF source email",[1810,150],post(`${site}/integrations/n8n/chief-of-staff/email/get`,`{emailKey:$json.contextId}`)),
  code("Prepare WOF draft prompt",[2040,150],prepareImapPromptCode),
  http("OpenAI — write WOF draft",[2270,150],{method:"POST",url:"https://api.openai.com/v1/responses",authentication:"predefinedCredentialType",nodeCredentialType:"openAiApi",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify($json.requestBody) }}",options:{timeout:60000}},openAiCredentials),
  code("Prepare WOF IMAP draft",[2500,150],prepareImapDraftCode),
  {id:id(),name:"WOF Events IMAP — create draft",type:"n8n-nodes-imap-ai.imap",typeVersion:1,position:[2730,150],credentials:{imap:eventsImapCredentials},parameters:{operation:"createDraft",draftFolder:{mode:"name",value:"Drafts"},to:"={{ $json.to }}",subject:"={{ $json.subject }}",messageFormat:"text",textBody:"={{ $json.draft }}",cc:"",bcc:"",fromName:"Tomáš Kočner"}},
  http("Complete — WOF draft ready",[2960,150],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$('Prepare WOF IMAP draft').item.json.command.commandId,worker:'NORA_COMMAND_WORKER',attempt:$('Prepare WOF IMAP draft').item.json.command.attempt,outcome:'DONE',result:'Koncept odpovede bol uložený priamo v schránke tomas.kocner@wofevents.com do priečinka '+String($json.draftFolder||'Drafts')+'. UID: '+String($json.uid||'')}`)),
  http("Complete — unsupported",[1810,330],post(`${site}/integrations/n8n/chief-of-staff/commands/complete`,`{commandId:$json.commandId,worker:'NORA_COMMAND_WORKER',attempt:$json.attempt,outcome:'FAILED',error:'Pre tento typ príkazu alebo zdroj ešte nie je pripojený vykonávací adaptér.'}`)),
]
const connections={
  "Command worker — every 2 minutes":{main:[[{node:"Claim commands",type:"main",index:0}]]},
  "Claim commands":{main:[[{node:"Split commands",type:"main",index:0}]]},
  "Split commands":{main:[[{node:"Start command",type:"main",index:0}]]},
  "Start command":{main:[[{node:"Route command",type:"main",index:0}]]},
  "Route command":{main:[[{node:"Needs owner approval?",type:"main",index:0}]]},
  "Needs owner approval?":{main:[[{node:"Complete — waiting approval",type:"main",index:0}],[{node:"Is email triage?",type:"main",index:0}]]},
  "Is email triage?":{main:[[{node:"Prepare triage",type:"main",index:0}],[{node:"Is Gmail draft?",type:"main",index:0}]]},
  "Prepare triage":{main:[[{node:"Is Gmail triage?",type:"main",index:0}]]},
  "Is Gmail triage?":{main:[[{node:"Gmail — list labels",type:"main",index:0}],[{node:"Convex — load IMAP triage email",type:"main",index:0}]]},
  "Gmail — list labels":{main:[[{node:"Prepare Gmail labels",type:"main",index:0}]]},
  "Prepare Gmail labels":{main:[[{node:"Create Gmail label?",type:"main",index:0}]]},
  "Create Gmail label?":{main:[[{node:"Gmail — create label",type:"main",index:0}],[{node:"Gmail — apply triage",type:"main",index:0}]]},
  "Gmail — create label":{main:[[{node:"Use created Gmail label",type:"main",index:0}]]},
  "Use created Gmail label":{main:[[{node:"Gmail — apply triage",type:"main",index:0}]]},
  "Gmail — apply triage":{main:[[{node:"Complete — Gmail triage",type:"main",index:0}]]},
  "Convex — load IMAP triage email":{main:[[{node:"Prepare IMAP move",type:"main",index:0}]]},
  "Prepare IMAP move":{main:[[{node:"WOF Events IMAP — move email",type:"main",index:0}]]},
  "WOF Events IMAP — move email":{main:[[{node:"Complete — IMAP triage",type:"main",index:0}]]},
  "Is Gmail draft?":{main:[[{node:"Gmail — load source message",type:"main",index:0}],[{node:"Is WOF IMAP draft?",type:"main",index:0}]]},
  "Gmail — load source message":{main:[[{node:"Prepare draft prompt",type:"main",index:0}]]},
  "Prepare draft prompt":{main:[[{node:"OpenAI — write draft",type:"main",index:0}]]},
  "OpenAI — write draft":{main:[[{node:"Prepare Gmail draft",type:"main",index:0}]]},
  "Prepare Gmail draft":{main:[[{node:"Gmail — create draft",type:"main",index:0}]]},
  "Gmail — create draft":{main:[[{node:"Complete — draft ready",type:"main",index:0}]]},
  "Is WOF IMAP draft?":{main:[[{node:"Convex — load WOF source email",type:"main",index:0}],[{node:"Complete — unsupported",type:"main",index:0}]]},
  "Convex — load WOF source email":{main:[[{node:"Prepare WOF draft prompt",type:"main",index:0}]]},
  "Prepare WOF draft prompt":{main:[[{node:"OpenAI — write WOF draft",type:"main",index:0}]]},
  "OpenAI — write WOF draft":{main:[[{node:"Prepare WOF IMAP draft",type:"main",index:0}]]},
  "Prepare WOF IMAP draft":{main:[[{node:"WOF Events IMAP — create draft",type:"main",index:0}]]},
  "WOF Events IMAP — create draft":{main:[[{node:"Complete — WOF draft ready",type:"main",index:0}]]},
}
const name="NORA — Command Execution Worker"
const settings={executionOrder:"v1",timezone:"Europe/Bratislava",saveDataSuccessExecution:process.env.WORKER_SAVE_SUCCESS==="1"?"all":"none",saveDataErrorExecution:"all",saveExecutionProgress:false,executionTimeout:180,callerPolicy:"workflowsFromSameOwner"}
const payload={name,nodes,connections,settings}
const existing=byName(name+" v2")??byName(name)
if(existing)payload.name=existing.name
const workflow=existing?await api(`/api/v1/workflows/${existing.id}`,{method:"PUT",body:JSON.stringify(payload)}):await api("/api/v1/workflows",{method:"POST",body:JSON.stringify(payload)})
console.log(JSON.stringify({id:workflow.id,active:workflow.active,nodeCount:workflow.nodes.length,name:workflow.name}))
