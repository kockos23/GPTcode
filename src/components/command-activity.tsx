import { makeFunctionReference } from 'convex/server'
import { useMutation,useQuery } from 'convex/react'
import { AlertCircle,Check,Clock3,LoaderCircle,RefreshCw,X } from 'lucide-react'
import { useState } from 'react'

type Event={fromStatus:string;toStatus:string;actor:string;note:string;createdAt:number}
type Command={id:string;command:string;intent:string;targetApp:string;approval:string;status:string;agent:string;result:string;error:string;attempt:number;createdAt:number;updatedAt:number;startedAt?:number;completedAt?:number;events:Event[]}
const api={overview:makeFunctionReference<'query',{limit?:number},Command[]>('commandLifecycle:overview'),decide:makeFunctionReference<'mutation',{commandId:string;decision:'APPROVE'|'CANCEL'|'RETRY'},{ok:boolean;status:string}>('commandLifecycle:decide')}
const labels:Record<string,string>={NEW:'Nové',PLANNED:'Napánované',RUNNING:'Spracúva sa',WAITING_APPROVAL:'Čaká na schválenie',DONE:'Hotovo',FAILED:'Zlyhalo',CANCELLED:'Zrušené'}
const icons:Record<string,typeof Clock3>={NEW:Clock3,PLANNED:Clock3,RUNNING:LoaderCircle,WAITING_APPROVAL:AlertCircle,DONE:Check,FAILED:AlertCircle,CANCELLED:X}

export function CommandActivity({highlightId}:{highlightId?:string}){
  const commands=useQuery(api.overview,{limit:12})
  const decide=useMutation(api.decide)
  const [busy,setBusy]=useState('')
  const act=async(id:string,decision:'APPROVE'|'CANCEL'|'RETRY')=>{setBusy(id);try{await decide({commandId:id,decision})}finally{setBusy('')}}
  if(!commands?.length)return null
  return <section className="command-activity"><div className="command-activity-heading"><div><strong>Reálny stav príkazov</strong><small>Stav pochádza z vykonávacej fronty, nie z potvrdenia tlačidla.</small></div></div><div className="command-activity-list">{commands.map(command=>{const Icon=icons[command.status]??Clock3;return <article key={command.id} className={highlightId===command.id?'highlighted':''}><div className="command-activity-top"><span className={'command-status '+command.status.toLowerCase()}><Icon className={command.status==='RUNNING'?'spin':''} size={13}/>{labels[command.status]??command.status}</span><small>{command.id} · pokus {command.attempt}/3</small></div><strong>{command.command}</strong><p>{command.targetApp} · {command.agent}</p>{command.result&&<div className="command-result">{command.result}</div>}{command.error&&<div className="task-error">{command.error}</div>}<div className="command-timeline">{command.events.slice(-5).map((event,index)=><span key={event.createdAt+'-'+index}><i/>{labels[event.toStatus]??event.toStatus}<small>{new Date(event.createdAt).toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'})}</small></span>)}</div><div className="command-decision-actions">{command.status==='WAITING_APPROVAL'&&<button className="button-primary" disabled={busy===command.id} onClick={()=>void act(command.id,'APPROVE')}><Check size={13}/>Schváliť vykonanie</button>}{command.status==='FAILED'&&command.attempt<3&&<button className="button-secondary" disabled={busy===command.id} onClick={()=>void act(command.id,'RETRY')}><RefreshCw size={13}/>Skúsiť znova</button>}{!['DONE','CANCELLED'].includes(command.status)&&<button className="text-link" disabled={busy===command.id} onClick={()=>void act(command.id,'CANCEL')}><X size={13}/>Zrušiť</button>}</div></article>})}</div></section>
}
