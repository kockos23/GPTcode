import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { CalendarPlus, Check, ListTodo, Mic, Pencil, Plus, Save, Sparkles, X } from 'lucide-react'

type Task = { id:string; title:string; details:string; priority:string; status:string; deadline?:string; source:string; assignee:string; updatedAt:number }
type Proposal = { id:string; title:string; priority:string; status:string; approval:string; assignedAgent:string; deadline?:number; expectedOutput:string }
type Command = { id:string; command:string; intent:string; status:string; createdAt:number }
type Overview = { tasks:Task[]; proposals:Proposal[]; commands:Command[] }

const noraApi = {
  overview: makeFunctionReference<'query', Record<string, never>, Overview>('noraWorkspace:overview'),
  createTask: makeFunctionReference<'mutation', { title:string; details?:string; priority:string; deadline?:string }, { id:string; status:string }>('noraWorkspace:createTask'),
  completeTask: makeFunctionReference<'mutation', { taskId:string }, null>('noraWorkspace:completeTask'),
  updateTask: makeFunctionReference<'mutation', { taskId:string; title?:string; details?:string; priority?:string; deadline?:string }, null>('noraWorkspace:updateTask'),
  proposeCalendarEvent: makeFunctionReference<'mutation', { taskId:string }, { id:string; status:string }>('noraWorkspace:proposeCalendarEvent'),
  decideProposal: makeFunctionReference<'mutation', { stepId:string; decision:'APPROVE'|'POSTPONE'|'DISMISS' }, { ok:boolean; status:string; taskId?:string }>('noraWorkspace:decideProposal'),
}

export function NoraWorkspace({ notify }: { notify:(message:string)=>void }) {
  const overview = useQuery(noraApi.overview, {})
  const createTask = useMutation(noraApi.createTask)
  const completeTask = useMutation(noraApi.completeTask)
  const updateTask = useMutation(noraApi.updateTask)
  const proposeCalendar = useMutation(noraApi.proposeCalendarEvent)
  const decideProposal = useMutation(noraApi.decideProposal)
  const [title,setTitle] = useState('')
  const [details,setDetails] = useState('')
  const [priority,setPriority] = useState('P2')
  const [deadline,setDeadline] = useState('')
  const [saving,setSaving] = useState(false)
  const [editingTaskId,setEditingTaskId] = useState('')
  const [editTitle,setEditTitle] = useState('')
  const [editDetails,setEditDetails] = useState('')

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
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const tomorrow = new Date(Date.parse(today+'T00:00:00Z')+86_400_000).toISOString().slice(0,10)
  const taskGroups = [
    { key:'overdue', label:'Po termíne', tasks:openTasks.filter(task=>task.deadline && task.deadline<today) },
    { key:'today', label:'Dnes', tasks:openTasks.filter(task=>task.deadline===today) },
    { key:'tomorrow', label:'Zajtra', tasks:openTasks.filter(task=>task.deadline===tomorrow) },
    { key:'upcoming', label:'Nadchádzajúce', tasks:openTasks.filter(task=>task.deadline && task.deadline>tomorrow) },
    { key:'later', label:'Bez termínu', tasks:openTasks.filter(task=>!task.deadline) },
  ].filter(group=>group.tasks.length)
  return <div className="page nora-workspace">
    <div className="page-intro nora-intro"><span className="nora-section-avatar"><img src={`${import.meta.env.BASE_URL}nora-avatar.webp`} alt="NORA — Chief of Staff" width={58} height={58}/></span><div><p className="eyebrow">Chief of Staff · osobný inbox</p><h2>NORA</h2><p>Nadiktuj alebo napíš večerný zoznam úloh. NORA ho rozdelí na samostatné položky, zoradí a pripraví ďalší krok. Z úlohy môžeš vytvoriť návrh udalosti; zápis do kalendára ostáva schvaľovaný.</p></div></div>

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
        <div className="nora-task-list">{taskGroups.map(group=><section className={'nora-task-group '+group.key} key={group.key}><h4>{group.label}<span>{group.tasks.length}</span></h4>{group.tasks.map(task=><article key={task.id}><div><span className="task-priority">{task.priority}</span><small>{task.source} · {task.status}</small></div>{editingTaskId===task.id?<div className="nora-task-content-edit"><label>Názov<input value={editTitle} onChange={event=>setEditTitle(event.target.value)}/></label><label>Popis a poznámky<textarea rows={3} value={editDetails} onChange={event=>setEditDetails(event.target.value)}/></label><div><button className="button-primary" disabled={!editTitle.trim()} onClick={()=>void updateTask({taskId:task.id,title:editTitle,details:editDetails}).then(()=>{setEditingTaskId('');notify('Zmeny úlohy sú uložené.')})}><Save size={13}/>Uložiť</button><button className="button-quiet" onClick={()=>setEditingTaskId('')}><X size={13}/>Zrušiť</button></div></div>:<><h4>{task.title}</h4>{task.details&&<p>{task.details}</p>}</>}<div className="nora-task-edit"><label>Dôležitosť<select value={task.priority} onChange={event=>void updateTask({taskId:task.id,priority:event.target.value})}><option value="P1">Dôležité</option><option value="P2">Normálne</option><option value="P3">Neskôr</option></select></label><label>Termín<input type="date" value={task.deadline??''} onChange={event=>void updateTask({taskId:task.id,deadline:event.target.value})}/></label></div><div className="idea-row-actions"><button className="button-secondary" onClick={()=>{setEditingTaskId(task.id);setEditTitle(task.title);setEditDetails(task.details)}}><Pencil size={13}/>Upraviť</button><button className="button-secondary" onClick={()=>void proposeCalendar({taskId:task.id}).then(()=>notify('NORA pripraví návrh udalosti na potvrdenie.'))}><CalendarPlus size={13}/>Do kalendára</button><button className="button-quiet" onClick={()=>void completeTask({taskId:task.id}).then(()=>notify('Úloha označená ako hotová.'))}><Check size={13}/>Hotovo</button></div></article>)}</section>)}</div>
        {overview&&openTasks.length===0&&<div className="connection-empty"><span><Check size={18}/></span><div><strong>Inbox je čistý</strong><p>Nové úlohy môžeš pridať tu alebo nadiktovať Nore.</p></div></div>}
      </section>
      <section className="panel"><div className="idea-panel-heading"><Sparkles size={17}/><div><h3>Návrhy agentov</h3><p>Plánovač nič nevykoná bez príslušného schválenia.</p></div></div>
        <div className="nora-proposal-list">{overview?.proposals.map(item=><article key={item.id}><div><span>{item.priority}</span><small>{item.assignedAgent}{item.approval==='OWNER'?' · čaká na schválenie':''}</small></div><h4>{item.title}</h4><p>{item.expectedOutput}</p><div className="idea-row-actions"><button className="button-secondary" onClick={()=>void decideProposal({stepId:item.id,decision:'APPROVE'}).then(()=>notify('Návrh je schválený a vznikla interná úloha.'))}><Check size={13}/>Schváliť</button><button className="button-quiet" onClick={()=>void decideProposal({stepId:item.id,decision:'POSTPONE'}).then(()=>notify('Návrh je odložený o jeden deň.'))}>Odložiť</button><button className="button-quiet" onClick={()=>void decideProposal({stepId:item.id,decision:'DISMISS'}).then(()=>notify('Návrh je zahodený.'))}>Zahodiť</button></div></article>)}</div>
        {overview&&overview.proposals.length===0&&<div className="connection-empty"><span><Sparkles size={18}/></span><div><strong>Žiadne nové návrhy</strong><p>Planner skontroluje signály pri ďalšom behu.</p></div></div>}
      </section>
    </div>
  </div>
}
