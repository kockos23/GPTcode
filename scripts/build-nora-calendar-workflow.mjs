import fs from 'node:fs'

const [sourcePath, snapshotPath, outputPath, ownerChatId] = process.argv.slice(2)
if (!sourcePath || !snapshotPath || !outputPath || !ownerChatId) throw new Error('Missing arguments')

const workflow = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
const calendarCredentials = snapshot.nodes.find((node) => node.type === 'n8n-nodes-base.googleCalendar')?.credentials
if (!calendarCredentials?.googleCalendarOAuth2Api) throw new Error('Google Calendar credential is missing')

const node = (name) => workflow.nodes.find((item) => item.name === name)
const agent = node('NORA Agent')
const parser = node('ParseAgentOutput')
if (!agent || !parser) throw new Error('NORA nodes are missing')

// Put the live clock directly into the agent input. Some n8n AI Agent versions
// do not interpolate {{$now}} inside systemMessage, which can make relative
// requests such as "zajtra" resolve against the model's stale training date.
agent.parameters.text = '={{ "CURRENT_DATETIME_EUROPE_BRATISLAVA=" + $now.setZone("Europe/Bratislava").toISO() + "\\nUSER_REQUEST=" + $json.rawText }}'

agent.parameters.options.systemMessage = agent.parameters.options.systemMessage
  .replace('NORA does not yet have general interactive access to Gmail, Calendar, Drive documents or business IMAP.', 'NORA has an approval-gated integration for creating and moving events in the primary Google Calendar. Gmail, Drive documents and business IMAP are not general interactive tools here.')
  .replace(
    '{"type":"RESPONSE","text":"short user-facing answer","intent":"CAPTURE|ROUTE|ANSWER|APPROVAL","specialist":"COS|NORA|WOF_FIN|FIRMA2_FIN|WOF_OPS|NIKE_LOCAL|RESEARCH|BUILD_TECH","priority":"URGENT|HIGH|NORMAL|LOW","approvalRequired":true,"title":"short task title","details":"concise structured details and proposed next step"}',
    '{"type":"RESPONSE","text":"short user-facing answer","intent":"CAPTURE|ROUTE|ANSWER|APPROVAL","specialist":"COS|NORA|WOF_FIN|FIRMA2_FIN|WOF_OPS|NIKE_LOCAL|RESEARCH|BUILD_TECH","priority":"URGENT|HIGH|NORMAL|LOW","approvalRequired":true,"title":"short task title","details":"concise structured details and proposed next step","calendarAction":"NONE|CREATE|MOVE","calendarReady":false,"calendarTitle":"","calendarStart":"ISO 8601 with Europe/Bratislava offset or empty","calendarEnd":"ISO 8601 with Europe/Bratislava offset or empty","calendarEventQuery":"existing event title for MOVE or empty","calendarDescription":""}',
  ) + `

Calendar rules:
- All writes target only the primary Google Calendar.
- For a request to create an event, set calendarAction=CREATE. For a request to move/reschedule an existing event, set calendarAction=MOVE and calendarEventQuery to its identifying title.
- Resolve relative dates against the current Europe/Bratislava time. Return absolute ISO 8601 timestamps with the correct offset.
- CREATE requires a title and start. If duration/end is missing, use 60 minutes and state that in text.
- MOVE requires an existing-event query and a new start. If the new end is missing, the workflow preserves the existing duration.
- Set calendarReady=true whenever CREATE has a title and start, or MOVE has an event query and new start. A supplied duration or end is optional because the workflow applies the documented default/preservation rule. Otherwise ask one concise clarification question and keep calendarReady=false.
- Never claim that an event was created or moved. The workflow will first store a proposal and require a separate owner confirmation.`

parser.parameters.jsCode = parser.parameters.jsCode.replace(
  'rawText: source.rawText,',
  `rawText: source.rawText,
    calendarAction: String(parsedData.calendarAction ?? 'NONE').toUpperCase(),
    calendarReady: parsedData.calendarReady === true,
    calendarTitle: String(parsedData.calendarTitle ?? ''),
    calendarStart: String(parsedData.calendarStart ?? ''),
    calendarEnd: String(parsedData.calendarEnd ?? ''),
    calendarEventQuery: String(parsedData.calendarEventQuery ?? ''),
    calendarDescription: String(parsedData.calendarDescription ?? ''),`,
)

const codeNode = (id, name, jsCode, position) => ({
  parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
})
const ifNode = (id, name, leftValue, rightValue, position) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: `${id}-condition`, leftValue, rightValue, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position,
})

const approvalRouter = codeNode('nora-calendar-router', 'Calendar Approval Router', `const source=$input.first().json;
const state=$getWorkflowStaticData('global');
state.calendarPending=state.calendarPending||{};
const now=Date.now();
for(const [key,value] of Object.entries(state.calendarPending)){if(!value||Number(value.expiresAt||0)<now)delete state.calendarPending[key]}
const chatKey=String(source.chatId||'');
const text=String(source.rawText||'').trim().toLocaleLowerCase('sk-SK');
const pending=state.calendarPending[chatKey];
const confirm=/^(áno|ano|potvrdzujem|potvrď|potvrd|ok)$/i.test(text);
const cancel=/^(zruš|zrus|zrušiť|zrusit|cancel)$/i.test(text);
if(pending&&confirm){return [{json:{...source,...pending,calendarRoute:'CONFIRM'}}]}
if(pending&&cancel){delete state.calendarPending[chatKey];return [{json:{...source,calendarRoute:'CANCEL',text:'Kalendárový návrh som zrušila.'}}]}
return [{json:{...source,calendarRoute:'NORMAL'}}];`, [3888, 1040])

const storeDraft = codeNode('nora-calendar-store', 'Store Calendar Draft', `const item=$input.first().json;
const ownerChat=${JSON.stringify(String(ownerChatId))};
if(String(item.chatId)!==ownerChat){return [{json:{...item,text:'Kalendárové zápisy sú povolené iba vlastníkovi.',calendarReady:false}}]}
const action=String(item.calendarAction||'NONE').toUpperCase();
const title=String(item.calendarTitle||item.title||'').trim().slice(0,300);
const query=String(item.calendarEventQuery||'').trim().slice(0,300);
const start=new Date(String(item.calendarStart||''));
let end=new Date(String(item.calendarEnd||''));
if(action==='CREATE'&&!Number.isFinite(end.getTime())&&Number.isFinite(start.getTime()))end=new Date(start.getTime()+60*60*1000);
const validStart=Number.isFinite(start.getTime());
const validEnd=Number.isFinite(end.getTime())&&end>start;
const valid=action==='CREATE'?Boolean(title&&validStart&&validEnd):Boolean(action==='MOVE'&&query&&validStart);
if(!valid){return [{json:{...item,text:item.text||'Potrebujem doplniť názov udalosti a nový dátum alebo čas.',calendarReady:false}}]}
const state=$getWorkflowStaticData('global');state.calendarPending=state.calendarPending||{};
const draft={calendarAction:action,calendarTitle:title,calendarEventQuery:query,calendarStart:start.toISOString(),calendarEnd:validEnd?end.toISOString():'',calendarDescription:String(item.calendarDescription||'').slice(0,2000),expiresAt:Date.now()+30*60*1000,requestMessageId:String(item.messageId||'')};
state.calendarPending[String(item.chatId)]=draft;
const when=new Intl.DateTimeFormat('sk-SK',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(start);
const verb=action==='CREATE'?'Vytvoriť':'Presunúť';
const label=action==='CREATE'?title:query;
return [{json:{...item,...draft,intent:'APPROVAL',approvalRequired:true,text:verb+' udalosť „'+label+'“ na '+when+' v hlavnom kalendári? Odpovedz ÁNO alebo ZRUŠ.'}}];`, [5312, 1056])

const resolveMove = codeNode('nora-calendar-resolve', 'Resolve Calendar Move', `const response=$input.first().json||{};const source=$('Calendar Approval Router').first().json;const rows=Array.isArray(response.items)?response.items.filter(row=>row&&row.id&&row.status!=='cancelled'):[];
if(rows.length!==1){return [{json:{...source,calendarResolved:'NO',text:rows.length===0?'Nenašla som jednoznačnú udalosť „'+source.calendarEventQuery+'“ v hlavnom kalendári. Upresni názov alebo pôvodný termín.':'Našla som viac udalostí „'+source.calendarEventQuery+'“. Upresni prosím pôvodný termín.'}}]}
const event=rows[0];const oldStart=new Date(event.start?.dateTime||event.start?.date);const oldEnd=new Date(event.end?.dateTime||event.end?.date);const newStart=new Date(source.calendarStart);let newEnd=new Date(source.calendarEnd||'');if(!Number.isFinite(newEnd.getTime())){const duration=Number.isFinite(oldEnd-oldStart)&&oldEnd>oldStart?oldEnd-oldStart:60*60*1000;newEnd=new Date(newStart.getTime()+duration)}
return [{json:{...source,calendarResolved:'YES',eventId:String(event.id),calendarTitle:String(event.summary||source.calendarEventQuery),calendarStart:newStart.toISOString(),calendarEnd:newEnd.toISOString()}}];`, [5008, 816])

const finalize = codeNode('nora-calendar-finalize', 'Finalize Calendar Action', `const event=$input.first().json||{};const source=$('Calendar Approval Router').first().json;const state=$getWorkflowStaticData('global');if(state.calendarPending)delete state.calendarPending[String(source.chatId)];const verb=source.calendarAction==='CREATE'?'vytvorila':'presunula';return [{json:{...source,text:'Hotovo — udalosť „'+String(event.summary||source.calendarTitle||source.calendarEventQuery)+'“ som '+verb+' v hlavnom kalendári.',intent:'ANSWER',approvalRequired:false,details:String(event.htmlLink||'')}}];`, [5616, 720])

const calendarAuth = { googleCalendarOAuth2Api: calendarCredentials.googleCalendarOAuth2Api }
const prepareCreateBody = codeNode('nora-calendar-create-body', 'Prepare Calendar Create Body', `const item=$input.first().json;return [{json:{...item,requestBody:JSON.stringify({summary:item.calendarTitle,description:item.calendarDescription||'',start:{dateTime:item.calendarStart,timeZone:'Europe/Bratislava'},end:{dateTime:item.calendarEnd,timeZone:'Europe/Bratislava'},extendedProperties:{private:{noraRequestId:item.requestMessageId||''}}})}}];`, [4896, 672])
const createEvent = {
  parameters: { method: 'POST', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ $json.requestBody }}', options: { timeout: 30000 } },
  id: 'nora-calendar-create', name: 'Google Calendar — Create Approved Event', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [5136, 672], credentials: calendarAuth,
}
const prepareFindRequest = codeNode('nora-calendar-find-request', 'Prepare Calendar Find Request', `const item=$input.first().json;const min=new Date(Date.now()-90*86400000).toISOString();const max=new Date(Date.now()+365*86400000).toISOString();return [{json:{...item,requestUrl:'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin='+encodeURIComponent(min)+'&timeMax='+encodeURIComponent(max)+'&q='+encodeURIComponent(item.calendarEventQuery||'')}}];`, [4656, 816])
const findEvent = {
  parameters: { method: 'GET', url: '={{ $json.requestUrl }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', options: { timeout: 30000 } },
  id: 'nora-calendar-find', name: 'Google Calendar — Find Event To Move', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [4768, 816], credentials: calendarAuth,
}
const prepareMoveBody = codeNode('nora-calendar-move-body', 'Prepare Calendar Move Body', `const item=$input.first().json;return [{json:{...item,requestUrl:'https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(item.eventId),requestBody:JSON.stringify({start:{dateTime:item.calendarStart,timeZone:'Europe/Bratislava'},end:{dateTime:item.calendarEnd,timeZone:'Europe/Bratislava'},extendedProperties:{private:{noraRequestId:item.requestMessageId||''}}})}}];`, [5376, 816])
const updateEvent = {
  parameters: { method: 'PATCH', url: '={{ $json.requestUrl }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ $json.requestBody }}', options: { timeout: 30000 } },
  id: 'nora-calendar-update', name: 'Google Calendar — Move Approved Event', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [5376, 816], credentials: calendarAuth,
}

const additions = [
  approvalRouter,
  ifNode('nora-calendar-is-confirm', 'Is Calendar Confirmation', '={{ $json.calendarRoute }}', 'CONFIRM', [4128, 1040]),
  ifNode('nora-calendar-is-cancel', 'Is Calendar Cancellation', '={{ $json.calendarRoute }}', 'CANCEL', [4368, 1152]),
  ifNode('nora-calendar-is-create', 'Is Calendar Create', '={{ $json.calendarAction }}', 'CREATE', [4528, 736]),
  // Route every requested calendar action through Store Calendar Draft. That
  // node validates the required fields deterministically; the LLM's boolean
  // must not be able to suppress an otherwise complete proposal.
  ifNode('nora-calendar-is-draft', 'Is Calendar Draft', '={{ ["CREATE","MOVE"].includes($json.calendarAction) ? "YES" : "NO" }}', 'YES', [5104, 1216]),
  storeDraft,
  prepareCreateBody,
  createEvent,
  prepareFindRequest,
  findEvent,
  resolveMove,
  ifNode('nora-calendar-is-resolved', 'Is Calendar Move Resolved', '={{ $json.calendarResolved }}', 'YES', [5248, 816]),
  prepareMoveBody,
  updateEvent,
  finalize,
]

const additionNames = new Set(additions.map((item) => item.name))
workflow.nodes = workflow.nodes.filter((item) => !additionNames.has(item.name)).concat(additions)

workflow.connections['EmptyInput'].main[1] = [{ node: 'Calendar Approval Router', type: 'main', index: 0 }]
workflow.connections['Calendar Approval Router'] = { main: [[{ node: 'Is Calendar Confirmation', type: 'main', index: 0 }]] }
workflow.connections['Is Calendar Confirmation'] = { main: [
  [{ node: 'Is Calendar Create', type: 'main', index: 0 }],
  [{ node: 'Is Calendar Cancellation', type: 'main', index: 0 }],
] }
workflow.connections['Is Calendar Cancellation'] = { main: [
  [{ node: 'FormatAndSplit', type: 'main', index: 0 }],
  [{ node: 'NORA Agent', type: 'main', index: 0 }],
] }
workflow.connections['Is Calendar Create'] = { main: [
  [{ node: 'Prepare Calendar Create Body', type: 'main', index: 0 }],
  [{ node: 'Prepare Calendar Find Request', type: 'main', index: 0 }],
] }
workflow.connections['Prepare Calendar Create Body'] = { main: [[{ node: 'Google Calendar — Create Approved Event', type: 'main', index: 0 }]] }
workflow.connections['Prepare Calendar Find Request'] = { main: [[{ node: 'Google Calendar — Find Event To Move', type: 'main', index: 0 }]] }
workflow.connections['ParseAgentOutput'] = { main: [[{ node: 'Is Calendar Draft', type: 'main', index: 0 }]] }
workflow.connections['Is Calendar Draft'] = { main: [
  [{ node: 'Store Calendar Draft', type: 'main', index: 0 }],
  [
    { node: 'FormatAndSplit', type: 'main', index: 0 },
    { node: 'Log Command Inbox', type: 'main', index: 0 },
    { node: 'Is Actionable Task', type: 'main', index: 0 },
  ],
] }
workflow.connections['Store Calendar Draft'] = { main: [[
  { node: 'FormatAndSplit', type: 'main', index: 0 },
  { node: 'Log Command Inbox', type: 'main', index: 0 },
]] }
workflow.connections['Google Calendar — Create Approved Event'] = { main: [[{ node: 'Finalize Calendar Action', type: 'main', index: 0 }]] }
workflow.connections['Google Calendar — Find Event To Move'] = { main: [[{ node: 'Resolve Calendar Move', type: 'main', index: 0 }]] }
workflow.connections['Resolve Calendar Move'] = { main: [[{ node: 'Is Calendar Move Resolved', type: 'main', index: 0 }]] }
workflow.connections['Is Calendar Move Resolved'] = { main: [
  [{ node: 'Prepare Calendar Move Body', type: 'main', index: 0 }],
  [{ node: 'FormatAndSplit', type: 'main', index: 0 }],
] }
workflow.connections['Prepare Calendar Move Body'] = { main: [[{ node: 'Google Calendar — Move Approved Event', type: 'main', index: 0 }]] }
workflow.connections['Google Calendar — Move Approved Event'] = { main: [[{ node: 'Finalize Calendar Action', type: 'main', index: 0 }]] }
workflow.connections['Finalize Calendar Action'] = { main: [[
  { node: 'FormatAndSplit', type: 'main', index: 0 },
  { node: 'Log Command Inbox', type: 'main', index: 0 },
]] }

const payload = { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings }
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n')
