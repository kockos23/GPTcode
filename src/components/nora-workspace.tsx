import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { CalendarPlus, Check, ListTodo, Mic, Plus, Sparkles } from 'lucide-react'

type Task = { id:string; title:string; details:string; priority:string; status:string; deadline?:string; source:string; assignee:string; updatedAt:number }
type Proposal = { id:string; title:string; priority:string; status:string; approval:string; assignedAgent:string; deadline?:number; expectedOutput:string }
type Command = { id:string; command:string; intent:string; status:string; createdAt:number }
type Overview = { tasks:Task[]; proposals:Proposal[]; commands:Command[] }

const noraApi = {
  overview: makeFunctionReference<'query', Record<string, never>, Overview>('noraWorkspace:overview'),
  createTask: makeFunctionReference<'mutation', { title:string; details?:string; priority:string; deadline?:string }, { id:string; status:string }>('noraWorkspace:createTask'),
  completeTask: makeFunctionReference<'mutation', { taskId:string }, null>('noraWorkspace:completeTask'),
  proposeCalendarEvent: makeFunctionReference<'mutation', { taskId:string }, { id:string; status:string }>('noraWorkspace:proposeCalendarEvent'),
}

export function NoraWorkspace({ notify }: { notify:(message:string)=>void }) {
  const overview = useQuery(noraApi.overview, {})
  const createTask = useMutation(noraApi.createTask)
  const completeTask = useMutation(noraApi.completeTask)
  const proposeCalendar = useMutation(noraApi.proposeCalendarEvent)
  const [title,setTitle] = useState('')
  const [details,setDetails] = useState('')
  const [priority,setPriority] = useState('P2')
  const [deadline,setDeadline] = useState('')
  const [saving,setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await createTask({ title:title.trim(), details:details.trim() || undefined, priority, deadline:deadline || undefined })
      setTitle(''); setDetails(''); setDeadline('')
      notify('Úloha je uložená v NORA Inboxe.')
    } finally { setSaving(false) }
  }

  const openTasks = overview?.tasks.filter(task => !['HOTOVO','ZRUŠENÉ'].includes(task.status)) ?? []
  return <div className="page nora-workspace">
    <div className="page-intro nora-intro"><span className="nora-section-avatar"><img src="/nora-avatar.webp" alt="NORA — Chief of Staff" width={58} height={58}/></span><div><p className="eyebrow">Chief of Staff · osobný inbox</p><h2>NORA</h2><p>Nadiktuj alebo napíš večerný zoznam úloh. NORA ho rozdelí na samostatné položky, zoradí a pripraví ďalší krok. Z úlohy môžeš vytvoriť návrh udalosti; zápis do kalendára ostáva schvaľovaný.</p></div></div>

    <section className="panel nora-capture-card">
      <div className="idea-panel-heading"><Plus size={17}/><div><h3>Pridať úlohu</h3><p>V Telegrame môžeš Nore poslať rovnaké zadanie textom alebo hlasovkou.</p></div></div>
      <div className="nora-task-form">
        <input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Čo treba urobiť?"/>
        <textarea rows={3} value={details} onChange={event=>setDetails(event.target.value)} placeholder="Kontext, očakávaný výsledok alebo ďalší krok…"/>
        <div><select value={priority} onChange={event=>setPriority(event.target.value)}><option value="P1">Dôležité</option><option value="P2">Normálne</option><option value="P3">Neskôr</option></select><input type="date" value={deadline} onChange={event=>setDeadline(event.target.value)}/><button className="button-primary" disabled={saving||!title.trim()} onClick={()=>void save()}>{saving?'Ukladám…':'Pridať Nore'}</button></div>
      </div>
      <div className="nora-voice-hint"><Mic size={15}/><span>Príklad hlasovky: „Nora, zapíš mi na zajtra tieto tri úlohy…“ Každý bod vznikne samostatne.</span></div>
    </section>

    <div className="nora-columns">
      <section className="panel"><div className="idea-panel-heading"><ListTodo size={17}/><div><h3>NORA Inbox</h3><p>{openTasks.length} otvorených úloh zo všetkých vstupov</p></div></div>
        <div className="nora-task-list">{openTasks.map(task=><article key={task.id}><div><span className="task-priority">{task.priority}</span><small>{task.source} · {task.status}{task.deadline?' · do '+task.deadline:''}</small></div><h4>{task.title}</h4>{task.details&&<p>{task.details}</p>}<div className="idea-row-actions"><button className="button-secondary" onClick={()=>void proposeCalendar({taskId:task.id}).then(()=>notify('NORA pripraví návrh udalosti na potvrdenie.'))}><CalendarPlus size={13}/>Do kalendára</button><button className="button-quiet" onClick={()=>void completeTask({taskId:task.id}).then(()=>notify('Úloha označená ako hotová.'))}><Check size={13}/>Hotovo</button></div></article>)}</div>
        {overview&&openTasks.length===0&&<div className="connection-empty"><span><Check size={18}/></span><div><strong>Inbox je čistý</strong><p>Nové úlohy môžeš pridať tu alebo nadiktovať Nore.</p></div></div>}
      </section>
      <section className="panel"><div className="idea-panel-heading"><Sparkles size={17}/><div><h3>Návrhy agentov</h3><p>Plánovač nič nevykoná bez príslušného schválenia.</p></div></div>
        <div className="nora-proposal-list">{overview?.proposals.map(item=><article key={item.id}><div><span>{item.priority}</span><small>{item.assignedAgent}{item.approval==='OWNER'?' · čaká na schválenie':''}</small></div><h4>{item.title}</h4><p>{item.expectedOutput}</p></article>)}</div>
        {overview&&overview.proposals.length===0&&<div className="connection-empty"><span><Sparkles size={18}/></span><div><strong>Žiadne nové návrhy</strong><p>Planner skontroluje signály pri ďalšom behu.</p></div></div>}
      </section>
    </div>
  </div>
}
