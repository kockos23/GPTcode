const WEEKDAYS:Record<string,number>={nedelu:0,nedeľu:0,pondelok:1,pondelka:1,utorok:2,utorka:2,stredu:3,streda:3,štvrtok:4,štvrtka:4,piatok:5,piatka:5,sobotu:6,sobota:6}

function bratislavaDate(now:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value);return{year:get('year'),month:get('month'),day:get('day')}}
function addDays(now:number,days:number){const local=bratislavaDate(now);return new Date(Date.UTC(local.year,local.month-1,local.day+days)).toISOString().slice(0,10)}
function nextWeekday(now:number,target:number){const local=bratislavaDate(now);const current=new Date(Date.UTC(local.year,local.month-1,local.day)).getUTCDay();let delta=(target-current+7)%7;if(delta===0)delta=7;return addDays(now,delta)}

export function parseTaskCommand(input:string,now=Date.now()){
  const original=input.trim().replace(/\s+/g,' ')
  const normalized=original.toLocaleLowerCase('sk')
  let priority='P2'
  if(/\b(urgentn|súrne|surne|hneď|hned|dôležit|dolezit|priorit)/i.test(normalized))priority='P1'
  if(/\b(neskôr|neskor|nízka priorita|nizka priorita|keď bude čas|ked bude cas)/i.test(normalized))priority='P3'
  let deadline:string|undefined
  if(/\bpozajtra\b/i.test(normalized))deadline=addDays(now,2)
  else if(/\bzajtra\b/i.test(normalized))deadline=addDays(now,1)
  else if(/\bdnes\b/i.test(normalized))deadline=addDays(now,0)
  const iso=normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  const sk=normalized.match(/\b(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(20\d{2})\b/)
  if(iso)deadline=`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`
  else if(sk)deadline=`${sk[3]}-${sk[2].padStart(2,'0')}-${sk[1].padStart(2,'0')}`
  else {const weekday=Object.entries(WEEKDAYS).find(([name])=>new RegExp(`\\b(?:do|na)\\s+${name}\\b`,'i').test(normalized));if(weekday)deadline=nextWeekday(now,weekday[1])}

  let title=original.replace(/^(?:nora[,.]?\s*)?(?:prosím\s+)?(?:pridaj|vytvor|zapíš|zapis|daj)\s+(?:mi\s+)?/i,'')
  // Prefixes can arrive in any natural order ("dôležitú úlohu na zajtra" or
  // "na zajtra úlohu"). Repeat the cleanup until no more metadata remains.
  let previous=''
  while(previous!==title){
    previous=title
    title=title
      .replace(/^(?:na|do)\s+(?:dnes|zajtra|pozajtra|pondelok|pondelka|utorok|utorka|stredu|streda|štvrtok|štvrtka|piatok|piatka|sobotu|sobota|nedelu|nedeľu)\s+/i,'')
      .replace(/^(?:\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*20\d{2}|20\d{2}-\d{1,2}-\d{1,2})\s*(?::|-)?\s*/,'')
      .replace(/^(?:dôležit(?:á|ú|é)|dolezit(?:a|u|e)|urgentn(?:á|ú|é)|súrn(?:a|u|e|á|ú|é)|neskôr|neskor)\s+/i,'')
      .replace(/^(?:úlohu|ulohu|pripomienku|task)\s*(?::|-)?\s*/i,'')
  }
  title=title
    .replace(/\b(?:urgentne|súrne|surne|dôležité|dolezite|neskôr|neskor)\b[.!]?/gi,'')
    .replace(/\s+/g,' ').trim()
  if(!title)title='Nová úloha z Command Centra'
  title=title.charAt(0).toLocaleUpperCase('sk')+title.slice(1)
  return{title:title.slice(0,300),deadline,priority,original}
}
