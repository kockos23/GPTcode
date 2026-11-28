// n8n's Telegram node defaults to legacy Markdown. Titles are copied into the
// morning brief, and one reserved character makes Telegram reject the send.
export function clip(value, max = 125) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/\\/g, "\\\\")
    .replace(/([_*`[])/g, "\\$1")
}

export function rpmNodeCode(schedule = "Chief of Staff sync — twice daily") {
  return `const zone = 'Europe/Bratislava';
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
${clip.toString()}
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
}
