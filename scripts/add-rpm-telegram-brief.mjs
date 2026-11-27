import { randomUUID } from "node:crypto"

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
if (sync.nodes.some(node => [render, send].includes(node.name)) || sync.connections[save]?.main?.flat().length) {
  throw new Error("Snapshot workflow already has downstream nodes")
}

const jsCode = `const zone = 'Europe/Bratislava';
const dateFormat = new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const clock = new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const trigger = new Date($(${JSON.stringify(schedule)}).first().json.timestamp);
const now = new Date();
if (!Number.isFinite(trigger.getTime()) || clock.format(trigger) !== '07:05' || dateFormat.format(trigger) !== dateFormat.format(now)) return [];
if ($json.ok !== true) return [];
const snapshot = $('Normalizuj Chief of Staff snapshot').first().json;
const today = dateFormat.format(now);
const state = $getWorkflowStaticData('global');
if (state.rpmSentDate === today) return [];
const clip = (value, max=125) => String(value ?? '').replace(/\\s+/g,' ').trim().slice(0,max);
const events = snapshot.calendar
  .filter(event => Number.isFinite(Date.parse(event.start)) && dateFormat.format(new Date(event.start)) === today)
  .sort((a,b) => a.start.localeCompare(b.start));
const timed = events.find(event => !event.allDay);
const task = snapshot.tasks.filter(item => item.title && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.deadline)
  && item.deadline <= today && !/HOTOVO|ZRUŠEN|DOKONČEN/i.test(item.status))
  .sort((a,b) => a.deadline.localeCompare(b.deadline))[0];
const outcomes = [];
if (timed) outcomes.push('Výsledok: Pripraviť sa na „'+clip(timed.title)+'“.\\nDôvod: Má pevný čas o '+clock.format(new Date(timed.start))+'.\\nAkcia: Pred stretnutím si spíš výstup, ktorý chceš dosiahnuť.');
if (task) outcomes.push('Výsledok: '+clip(task.title)+'\\nDôvod: Termín v Control Center je '+task.deadline+'.\\nAkcia: Over stav úlohy a vyhraď si čas na ďalší krok.');
const lines = ['Dobré ráno, Tomáš ☀️', 'NORA · '+today, '', '🎯 Dnešné výsledky',
  outcomes.join('\\n\\n') || 'Vyber si jeden konkrétny výsledok, ktorý chceš dnes dosiahnuť.',
  '', '📅 Dnes v kalendári'];
for (const event of events.slice(0,5)) {
  lines.push('• '+(event.allDay ? 'Celý deň' : clock.format(new Date(event.start)))+' · '+clip(event.title));
}
if (!events.length) lines.push('Dnes nemáš v načítaných kalendároch žiadne udalosti.');
if (events.length > 5) lines.push('Ďalšie udalosti: '+(events.length-5));
lines.push('', 'Chief of Staff: https://kockos23.github.io/GPTcode/');
state.rpmSentDate = today;
return [{json:{text:lines.join('\\n')}}];`

const nodes = [...sync.nodes,
  { id: randomUUID(), name: render, type: "n8n-nodes-base.code", typeVersion: 2, position: [2220, 0], parameters: { jsCode } },
  { id: randomUUID(), name: send, type: telegram.type, typeVersion: telegram.typeVersion, position: [2440, 0],
    credentials: telegram.credentials, parameters: { resource: "message", operation: "sendMessage",
      chatId, text: "={{ $json.text }}", additionalFields: { appendAttribution: false, disable_web_page_preview: true } } },
]
const edge = node => ({ main: [[{ node, type: "main", index: 0 }]] })
const connections = { ...sync.connections, [save]: edge(render), [render]: edge(send) }
const saved = process.argv.includes("--apply")
  ? await workflow(sync.id, { name:sync.name, nodes, connections, settings:sync.settings }) : sync
console.log(JSON.stringify({ active:saved.active, applied:saved.nodes.some(node => node.name === send), time:"07:05 Europe/Bratislava" }))
