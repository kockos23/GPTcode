import { makeFunctionReference } from 'convex/server'
import { useMutation,useQuery } from 'convex/react'
import { useState } from 'react'
import { ArrowRight,Clock3,Plus,Workflow } from 'lucide-react'

type Handoff={_id:string;handoffId:string;fromAgent:string;toAgents:string[];kind:string;title:string;summary:string;requestedAction:string;priority:string;status:string;claimedBy?:string;leaseUntil?:number;result?:string;error?:string;createdAt:number}
type Overview={rows:Handoff[];availableAgents:string[]}
const api={overview:makeFunctionReference<'query',Record<string,never>,Overview>('agentWorkspace:overview'),create:makeFunctionReference<'mutation',{toAgent:string;kind:string;title:string;summary:string;requestedAction:string;priority:string},{ok:boolean;handoffId:string}>('agentWorkspace:createHandoff')}

export function AgentHandoffWorkspace(){
  const overview=useQuery(api.overview,{})
  const create=useMutation(api.create)
  const [form,setForm]=useState({toAgent:'CODEX',kind:'TASK',title:'',summary:'',requestedAction:'',priority:'P2'})
  const [saving,setSaving]=useState(false)
  const [feedback,setFeedback]=useState('')
  const submit=async()=>{if(!form.title.trim()||!form.requestedAction.trim())return;setSaving(true);setFeedback('');try{await create(form);setForm(current=>({...current,title:'',summary:'',requestedAction:''}));setFeedback('Handoff je uložený vo fronte. Agent ho prevezme až po pripojení svojho adaptéra.')}catch{setFeedback('Handoff sa nepodarilo uložiť. Skontroluj prihlásenie a skús to znova.')}finally{setSaving(false)}}
  return <section className="panel handoff-workspace"><div className="idea-panel-heading"><Workflow size={17}/><div><h3>Agent Handoff Bus</h3><p>Trvalá auditovaná fronta medzi Codexom, Claude Code, Cursorom, Grokom a NOROU.</p></div></div>
    <div className="handoff-create"><select aria-label="Cieľový agent" value={form.toAgent} onChange={e=>setForm({...form,toAgent:e.target.value})}>{overview?.availableAgents.filter(x=>x!=='NORA').map(agent=><option key={agent}>{agent}</option>)}</select><select aria-label="Priorita" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>P0</option><option>P1</option><option>P2</option></select><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Názov úlohy"/><input value={form.requestedAction} onChange={e=>setForm({...form,requestedAction:e.target.value})} placeholder="Čo má agent konkrétne odovzdať?"/><textarea rows={2} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="Potrebný kontext bez hesiel a citlivých dát"/><button className="button-primary" disabled={saving||!form.title.trim()||!form.requestedAction.trim()} onClick={()=>void submit()}><Plus size={14}/>{saving?'Ukladám…':'Vytvoriť handoff'}</button></div>
    {feedback&&<p className="handoff-feedback" role="status">{feedback}</p>}
    <div className="handoff-list">{overview?.rows.map(row=><article key={row._id}><div><span className={'badge status '+row.status.toLowerCase()}>{row.status}</span><small>{row.priority} · {new Date(row.createdAt).toLocaleString('sk-SK')}</small></div><h4>{row.title}</h4><p><strong>{row.fromAgent}</strong><ArrowRight size={12}/><strong>{row.toAgents.join(', ')}</strong></p><p>{row.requestedAction}</p>{row.claimedBy&&<small><Clock3 size={11}/> prevzal {row.claimedBy}</small>}{row.result&&<div className="handoff-result">{row.result}</div>}{row.error&&<div className="task-error">{row.error}</div>}</article>)}</div>
    {overview&&overview.rows.length===0&&<div className="connection-empty"><span><Workflow size={18}/></span><div><strong>Fronta je prázdna</strong><p>Prvý handoff môžeš pripraviť vyššie; agent ho uvidí po bezpečnom pripojení.</p></div></div>}
  </section>
}
