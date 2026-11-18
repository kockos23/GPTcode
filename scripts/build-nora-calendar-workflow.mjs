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

for (const sttName of ['STT Voice', 'STT Audio']) {
  const stt = node(sttName)
  if (stt) stt.parameters.options = { ...(stt.parameters.options || {}), language: 'sk' }
}

// Put the live clock directly into the agent input. Some n8n AI Agent versions
// do not interpolate {{$now}} inside systemMessage, which can make relative
// requests such as "zajtra" resolve against the model's stale training date.
agent.parameters.text = '={{ "CURRENT_DATETIME_EUROPE_BRATISLAVA=" + $now.setZone("Europe/Bratislava").toISO() + "\\nUSER_REQUEST=" + $json.rawText }}'

agent.parameters.options.systemMessage = agent.parameters.options.systemMessage
  .replace('NORA does not yet have general interactive access to Gmail, Calendar, Drive documents or business IMAP.', 'NORA has an approval-gated integration for creating and moving events in the primary Google Calendar. Gmail, Drive documents and business IMAP are not general interactive tools here.')
  .replace(
    '{"type":"RESPONSE","text":"short user-facing answer","intent":"CAPTURE|ROUTE|ANSWER|APPROVAL","specialist":"COS|NORA|WOF_FIN|FIRMA2_FIN|WOF_OPS|NIKE_LOCAL|RESEARCH|BUILD_TECH","priority":"URGENT|HIGH|NORMAL|LOW","approvalRequired":true,"title":"short task title","details":"concise structured details and proposed next step"}',
    '{"type":"RESPONSE","text":"short user-facing answer","intent":"CAPTURE|ROUTE|ANSWER|APPROVAL","specialist":"COS|NORA|WOF_FIN|FIRMA2_FIN|WOF_OPS|NIKE_LOCAL|RESEARCH|BUILD_TECH","priority":"URGENT|HIGH|NORMAL|LOW","approvalRequired":true,"title":"short task title","details":"concise structured details and proposed next step","calendarAction":"NONE|CREATE|MOVE","calendarReady":false,"calendarTitle":"","calendarStart":"ISO 8601 with Europe/Bratislava offset or empty","calendarEnd":"ISO 8601 with Europe/Bratislava offset or empty","calendarEventQuery":"existing event title for MOVE or empty","calendarDescription":"","calendarLocation":"","calendarEvents":[{"title":"","start":"ISO 8601","end":"ISO 8601 or empty","description":"all relevant notes and URLs","location":"online URL or physical place"}]}',
  ) + `

Calendar rules:
- All writes target only the primary Google Calendar.
- For a request to create an event, set calendarAction=CREATE. For a request to move/reschedule an existing event, set calendarAction=MOVE and calendarEventQuery to its identifying title.
- Resolve relative dates against the current Europe/Bratislava time. Return absolute ISO 8601 timestamps with the correct offset.
- CREATE requires a title and start. If duration/end is missing, use 60 minutes and state that in text.
- If one request contains multiple events, put every event in calendarEvents and set calendarAction=CREATE. Preserve all relevant links, access restrictions and follow-up notes in each description. Put the primary online joining URL or physical venue in location as well as retaining it in description. For a single event, calendarEvents may contain that one event.
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
    calendarDescription: String(parsedData.calendarDescription ?? ''),
    calendarLocation: String(parsedData.calendarLocation ?? ''),
    calendarEvents: Array.isArray(parsedData.calendarEvents) ? parsedData.calendarEvents : [],`,
)

const codeNode = (id, name, jsCode, position) => ({
  parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
})
const calendarExtractor = {
  parameters: {
    promptType: 'define',
    text: '={{ "CURRENT_DATETIME_EUROPE_BRATISLAVA=" + $now.setZone("Europe/Bratislava").toISO() + "\\nEXTRACT_EVERY_CALENDAR_EVENT_FROM_THIS_REQUEST:\\n" + $("MergeInput").first().json.rawText }}',
    options: {
      systemMessage: `You are a deterministic calendar event extractor. Return one JSON object and nothing else: {"events":[{"title":"","start":"ISO 8601 with Europe/Bratislava offset","end":"ISO 8601 with Europe/Bratislava offset","description":"","location":""}]}. Extract EVERY distinct event in the request, in source order. Never omit a second or later event. Preserve every relevant URL and note in that event's description. Put the primary joining URL or physical venue in location, while also retaining the URL in description. If an end/duration is absent, set end exactly 60 minutes after start. Do not reuse durations from conversation history. The current request is the only source of event facts.`,
    },
  },
  id: 'nora-calendar-extractor',
  name: 'Calendar Event Extractor',
  type: '@n8n/n8n-nodes-langchain.agent',
  typeVersion: 1.6,
  position: [5312, 1184],
}
const parseCalendarEvents = codeNode('nora-calendar-parse-events', 'Parse Calendar Events', `const input=$input.first().json;const source=$('ParseAgentOutput').first().json;const raw=String(input.output||input.text||'').trim().replace(/^\`\`\`(?:json)?\\s*/i,'').replace(/\`\`\`$/,'').trim();let parsed={};try{parsed=JSON.parse(raw)}catch(error){const start=raw.indexOf('{');const end=raw.lastIndexOf('}');if(start>=0&&end>start)parsed=JSON.parse(raw.slice(start,end+1))}const events=Array.isArray(parsed.events)?parsed.events:[];const request=String(source.rawText||'');const ranges=[...request.matchAll(/\\b(\\d{1,2}):(\\d{2})\\s*[–—-]\\s*(\\d{1,2}):(\\d{2})\\b/g)];const used=new Set();for(const match of ranges){const startClock=String(match[1]).padStart(2,'0')+':'+match[2];const index=events.findIndex((event,i)=>!used.has(i)&&String(event?.start||'').includes('T'+startClock));if(index<0)continue;used.add(index);const startMinutes=Number(match[1])*60+Number(match[2]);let endMinutes=Number(match[3])*60+Number(match[4]);if(endMinutes<=startMinutes)endMinutes+=1440;const startDate=new Date(events[index].start);if(Number.isFinite(startDate.getTime()))events[index].end=new Date(startDate.getTime()+(endMinutes-startMinutes)*60000).toISOString()}for(const event of events){if(!/^https?:\\/\\//i.test(String(event.location||''))){const url=String(event.description||'').match(/https?:\\/\\/[^\\s]+/i)?.[0];if(url)event.location=url}}const expectedDates=(request.match(/\\b\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*\\d{4}\\b/g)||[]).length;if(!events.length||(expectedDates>1&&events.length<expectedDates)){return [{json:{...source,calendarAction:'NONE',calendarReady:false,text:'Zadanie obsahuje viac udalostí, ale nepodarilo sa ich všetky spoľahlivo rozlíšiť. Nič som nezapísala; pošli ich prosím znova s názvom a termínom každej udalosti.'}}]}return [{json:{...source,calendarEvents:events,calendarReady:true}}];`, [5552, 1184])
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
const compact=text.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const pending=state.calendarPending[chatKey];
const extract=$('ExtractPayload').first().json||{};
const isShortVoice=String(extract.hasVoice)==='true'&&Number(source.usage?.seconds||extract.message?.voice?.duration||0)<=3;
const voiceConfirm=isShortVoice&&/^(ano|a nao|ah nao|a no|ah no)$/i.test(compact);
const confirm=/^(áno|ano|potvrdzujem|potvrď|potvrd|ok)$/i.test(text)||voiceConfirm;
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
const rawEvents=Array.isArray(item.calendarEvents)&&item.calendarEvents.length?item.calendarEvents:[{title,start:item.calendarStart,end:item.calendarEnd,description:item.calendarDescription,location:item.calendarLocation}];
const calendarEvents=rawEvents.slice(0,20).map((row,index)=>{const eventStart=new Date(String(row?.start||''));let eventEnd=new Date(String(row?.end||''));if(!Number.isFinite(eventEnd.getTime())&&Number.isFinite(eventStart.getTime()))eventEnd=new Date(eventStart.getTime()+60*60*1000);return {title:String(row?.title||'').trim().slice(0,300),start:Number.isFinite(eventStart.getTime())?eventStart.toISOString():'',end:Number.isFinite(eventEnd.getTime())?eventEnd.toISOString():'',description:String(row?.description||'').slice(0,8000),location:String(row?.location||'').slice(0,1000),requestId:String(item.messageId||'')+'-'+index}});
const validEvents=calendarEvents.length>0&&calendarEvents.every(row=>row.title&&Number.isFinite(new Date(row.start).getTime())&&Number.isFinite(new Date(row.end).getTime())&&new Date(row.end)>new Date(row.start));
const valid=action==='CREATE'?validEvents:Boolean(action==='MOVE'&&query&&validStart);
if(!valid){return [{json:{...item,text:item.text||'Potrebujem doplniť názov udalosti a nový dátum alebo čas.',calendarReady:false}}]}
const state=$getWorkflowStaticData('global');state.calendarPending=state.calendarPending||{};
const draft={calendarAction:action,calendarTitle:title,calendarEventQuery:query,calendarStart:validStart?start.toISOString():'',calendarEnd:validEnd?end.toISOString():'',calendarDescription:String(item.calendarDescription||'').slice(0,8000),calendarLocation:String(item.calendarLocation||'').slice(0,1000),calendarEvents,expiresAt:Date.now()+30*60*1000,requestMessageId:String(item.messageId||'')};
state.calendarPending[String(item.chatId)]=draft;
const when=new Intl.DateTimeFormat('sk-SK',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(start);
const verb=action==='CREATE'?'Vytvoriť':'Presunúť';
const label=action==='CREATE'?title:query;
const eventLines=action==='CREATE'?calendarEvents.map(row=>'• „'+row.title+'“ — '+new Intl.DateTimeFormat('sk-SK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(new Date(row.start))).join('\\n'):'„'+label+'“ na '+when;
const proposal=action==='CREATE'?(calendarEvents.length>1?verb+' tieto udalosti:\\n'+eventLines:verb+' udalosť „'+calendarEvents[0].title+'“ na '+new Intl.DateTimeFormat('sk-SK',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(new Date(calendarEvents[0].start))):verb+' udalosť '+eventLines;
return [{json:{...item,...draft,intent:'APPROVAL',approvalRequired:true,text:proposal+' v hlavnom kalendári? Odpovedz ÁNO alebo ZRUŠ.'}}];`, [5312, 1056])

const resolveMove = codeNode('nora-calendar-resolve', 'Resolve Calendar Move', `const response=$input.first().json||{};const source=$('Calendar Approval Router').first().json;const rows=Array.isArray(response.items)?response.items.filter(row=>row&&row.id&&row.status!=='cancelled'):[];
if(rows.length!==1){return [{json:{...source,calendarResolved:'NO',text:rows.length===0?'Nenašla som jednoznačnú udalosť „'+source.calendarEventQuery+'“ v hlavnom kalendári. Upresni názov alebo pôvodný termín.':'Našla som viac udalostí „'+source.calendarEventQuery+'“. Upresni prosím pôvodný termín.'}}]}
const event=rows[0];const oldStart=new Date(event.start?.dateTime||event.start?.date);const oldEnd=new Date(event.end?.dateTime||event.end?.date);const newStart=new Date(source.calendarStart);let newEnd=new Date(source.calendarEnd||'');if(!Number.isFinite(newEnd.getTime())){const duration=Number.isFinite(oldEnd-oldStart)&&oldEnd>oldStart?oldEnd-oldStart:60*60*1000;newEnd=new Date(newStart.getTime()+duration)}
return [{json:{...source,calendarResolved:'YES',eventId:String(event.id),calendarTitle:String(event.summary||source.calendarEventQuery),calendarStart:newStart.toISOString(),calendarEnd:newEnd.toISOString()}}];`, [5008, 816])

const finalize = codeNode('nora-calendar-finalize', 'Finalize Calendar Action', `const events=$input.all().map(item=>item.json||{});const source=$('Calendar Approval Router').first().json;const state=$getWorkflowStaticData('global');if(state.calendarPending)delete state.calendarPending[String(source.chatId)];if(source.calendarAction==='CREATE'&&events.length>1){return [{json:{...source,text:'Hotovo — vytvorila som '+events.length+' udalosti v hlavnom kalendári: '+events.map(event=>'„'+String(event.summary||'Udalosť')+'“').join(', ')+'.',intent:'ANSWER',approvalRequired:false,details:events.map(event=>event.htmlLink||'').filter(Boolean).join('\\n')}}]}const event=events[0]||{};const verb=source.calendarAction==='CREATE'?'vytvorila':'presunula';return [{json:{...source,text:'Hotovo — udalosť „'+String(event.summary||source.calendarTitle||source.calendarEventQuery)+'“ som '+verb+' v hlavnom kalendári.',intent:'ANSWER',approvalRequired:false,details:String(event.htmlLink||'')}}];`, [5616, 720])

const calendarAuth = { googleCalendarOAuth2Api: calendarCredentials.googleCalendarOAuth2Api }
const prepareCreateBody = codeNode('nora-calendar-create-body', 'Prepare Calendar Create Body', `const item=$input.first().json;const events=Array.isArray(item.calendarEvents)&&item.calendarEvents.length?item.calendarEvents:[{title:item.calendarTitle,start:item.calendarStart,end:item.calendarEnd,description:item.calendarDescription,location:item.calendarLocation,requestId:item.requestMessageId}];return events.map(event=>({json:{...item,requestBody:JSON.stringify({summary:event.title,description:event.description||'',location:event.location||'',start:{dateTime:event.start,timeZone:'Europe/Bratislava'},end:{dateTime:event.end,timeZone:'Europe/Bratislava'},extendedProperties:{private:{noraRequestId:event.requestId||item.requestMessageId||''}}})}}));`, [4896, 672])
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
  ifNode('nora-calendar-needs-extraction', 'Needs Calendar Event Extraction', '={{ $json.calendarAction }}', 'CREATE', [5232, 1056]),
  calendarExtractor,
  parseCalendarEvents,
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
  [{ node: 'Needs Calendar Event Extraction', type: 'main', index: 0 }],
  [
    { node: 'FormatAndSplit', type: 'main', index: 0 },
    { node: 'Log Command Inbox', type: 'main', index: 0 },
    { node: 'Is Actionable Task', type: 'main', index: 0 },
  ],
] }
workflow.connections['Needs Calendar Event Extraction'] = { main: [
  [{ node: 'Calendar Event Extractor', type: 'main', index: 0 }],
  [{ node: 'Store Calendar Draft', type: 'main', index: 0 }],
] }
workflow.connections['Calendar Event Extractor'] = { main: [[{ node: 'Parse Calendar Events', type: 'main', index: 0 }]] }
workflow.connections['Parse Calendar Events'] = { main: [[{ node: 'Store Calendar Draft', type: 'main', index: 0 }]] }
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

workflow.connections['Agent Chat Model'].ai_languageModel[0].push({ node: 'Calendar Event Extractor', type: 'ai_languageModel', index: 0 })

const payload = { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings }
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n')
