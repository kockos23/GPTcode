import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { CalendarClock, Car, Droplets, Gauge, House, Plus, ReceiptText, Zap } from 'lucide-react'

type Asset={_id:string;assetId:string;domain:string;kind:string;name:string;status:string}
type Maintenance={_id:string;assetId:string;category:string;title:string;nextDueAt:number;notes:string}
type Reading={_id:string;assetId:string;utility:string;recordedAt:number;value:number;unit:string}
type Subscription={_id:string;name:string;provider:string;amount?:number;currency?:string;billingCycle:string;nextRenewalAt?:number}
type Overview={assets:Asset[];maintenance:Maintenance[];readings:Reading[];subscriptions:Subscription[]}

const homeApi={
  overview:makeFunctionReference<'query',Record<string,never>,Overview>('homeWorkspace:overview'),
  saveAsset:makeFunctionReference<'mutation',{domain:'HOME'|'VEHICLE';kind:string;name:string},{ok:boolean;assetId:string}>('homeWorkspace:saveAsset'),
  saveMaintenance:makeFunctionReference<'mutation',{assetId:string;category:string;title:string;nextDueDate:string;recurrence:string;notes:string},{ok:boolean;maintenanceId:string}>('homeWorkspace:saveMaintenance'),
  saveReading:makeFunctionReference<'mutation',{assetId:string;utility:'ELECTRICITY'|'WATER';date:string;value:number;unit:string;note:string},{ok:boolean;readingId:string}>('homeWorkspace:saveReading'),
  saveSubscription:makeFunctionReference<'mutation',{name:string;provider:string;amount?:number;currency:string;billingCycle:string;nextRenewalDate?:string},{ok:boolean;subscriptionId:string}>('homeWorkspace:saveSubscription'),
}
const date=(value?:number)=>value?new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',day:'numeric',month:'short',year:'numeric'}).format(value):'bez termínu'
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava'}).format(new Date())

export function HomeWorkspace({notify}:{notify:(message:string)=>void}){
  const overview=useQuery(homeApi.overview,{})
  const saveAsset=useMutation(homeApi.saveAsset),saveMaintenance=useMutation(homeApi.saveMaintenance),saveReading=useMutation(homeApi.saveReading),saveSubscription=useMutation(homeApi.saveSubscription)
  const [asset,setAsset]=useState({domain:'HOME' as 'HOME'|'VEHICLE',kind:'PROPERTY',name:''})
  const [maintenance,setMaintenance]=useState({assetId:'',category:'OTHER',title:'',nextDueDate:'',recurrence:'YEARLY',notes:''})
  const [reading,setReading]=useState({assetId:'',utility:'ELECTRICITY' as 'ELECTRICITY'|'WATER',date:today(),value:'',unit:'kWh',note:''})
  const [subscription,setSubscription]=useState({name:'',provider:'',amount:'',currency:'EUR',billingCycle:'MONTHLY',nextRenewalDate:''})
  const latestByAsset=new Map<string,Reading>()
  for(const reading of overview?.readings??[])if(!latestByAsset.has(reading.assetId))latestByAsset.set(reading.assetId,reading)
  const assetName=new Map((overview?.assets??[]).map(item=>[item.assetId,item.name]))
  return <div className="page home-workspace">
    <div className="page-intro"><div><p className="eyebrow">Domácnosť · energie · autá</p><h2>Home & Vehicle Manager</h2><p>Jeden bezpečný register spotrieb, termínov údržby, STK, pneumatík a predplatných. Systém zatiaľ iba eviduje a upozorňuje; nič neplatí ani neobjednáva bez potvrdenia.</p></div></div>
    <div className="health-metric-grid">
      <article><House/><small>Evidované aktíva</small><strong>{overview?.assets.length??'—'}</strong></article>
      <article><CalendarClock/><small>Aktívne termíny</small><strong>{overview?.maintenance.length??'—'}</strong></article>
      <article><Gauge/><small>Odpočty</small><strong>{overview?.readings.length??'—'}</strong></article>
      <article><ReceiptText/><small>Predplatné</small><strong>{overview?.subscriptions.length??'—'}</strong></article>
    </div>
    <section className="panel home-capture"><div className="idea-panel-heading"><Plus size={17}/><div><h3>Rýchle doplnenie registra</h3><p>Údaje sa ukladajú iba do tvojho súkromného Convex registra.</p></div></div><div className="home-form-grid">
      <form onSubmit={e=>{e.preventDefault();if(!asset.name.trim())return;void saveAsset(asset).then(()=>{setAsset({...asset,name:''});notify('Aktívum je uložené.')})}}><strong>Aktívum</strong><select value={asset.domain} onChange={e=>setAsset({...asset,domain:e.target.value as 'HOME'|'VEHICLE'})}><option value="HOME">Domácnosť</option><option value="VEHICLE">Vozidlo</option></select><input value={asset.kind} onChange={e=>setAsset({...asset,kind:e.target.value})} placeholder="Typ: byt, elektromer, auto…"/><input value={asset.name} onChange={e=>setAsset({...asset,name:e.target.value})} placeholder="Názov"/><button className="button-secondary"><Plus size={13}/>Uložiť</button></form>
      <form onSubmit={e=>{e.preventDefault();if(!maintenance.assetId||!maintenance.title||!maintenance.nextDueDate)return;void saveMaintenance(maintenance).then(()=>{setMaintenance({...maintenance,title:'',nextDueDate:'',notes:''});notify('Termín údržby je uložený.')})}}><strong>Kontrola alebo servis</strong><select value={maintenance.assetId} onChange={e=>setMaintenance({...maintenance,assetId:e.target.value})}><option value="">Vyber aktívum</option>{overview?.assets.map(a=><option key={a.assetId} value={a.assetId}>{a.name}</option>)}</select><input value={maintenance.title} onChange={e=>setMaintenance({...maintenance,title:e.target.value})} placeholder="STK, komín, prezutie…"/><input type="date" value={maintenance.nextDueDate} onChange={e=>setMaintenance({...maintenance,nextDueDate:e.target.value})}/><button className="button-secondary"><Plus size={13}/>Uložiť</button></form>
      <form onSubmit={e=>{e.preventDefault();if(!reading.assetId||reading.value==='')return;void saveReading({...reading,value:Number(reading.value)}).then(()=>{setReading({...reading,value:'',note:''});notify('Odpočet je uložený.')})}}><strong>Odpočet</strong><select value={reading.assetId} onChange={e=>setReading({...reading,assetId:e.target.value})}><option value="">Vyber merač</option>{overview?.assets.filter(a=>a.domain==='HOME').map(a=><option key={a.assetId} value={a.assetId}>{a.name}</option>)}</select><select value={reading.utility} onChange={e=>setReading({...reading,utility:e.target.value as 'ELECTRICITY'|'WATER',unit:e.target.value==='WATER'?'m³':'kWh'})}><option value="ELECTRICITY">Elektrina</option><option value="WATER">Voda</option></select><input type="number" min="0" step="0.001" value={reading.value} onChange={e=>setReading({...reading,value:e.target.value})} placeholder={`Stav v ${reading.unit}`}/><button className="button-secondary"><Plus size={13}/>Uložiť</button></form>
      <form onSubmit={e=>{e.preventDefault();if(!subscription.name.trim())return;void saveSubscription({name:subscription.name,provider:subscription.provider,amount:subscription.amount?Number(subscription.amount):undefined,currency:subscription.currency,billingCycle:subscription.billingCycle,nextRenewalDate:subscription.nextRenewalDate||undefined}).then(()=>{setSubscription({...subscription,name:'',provider:'',amount:'',nextRenewalDate:''});notify('Predplatné je uložené.')})}}><strong>Predplatné</strong><input value={subscription.name} onChange={e=>setSubscription({...subscription,name:e.target.value})} placeholder="Názov služby"/><input value={subscription.provider} onChange={e=>setSubscription({...subscription,provider:e.target.value})} placeholder="Poskytovateľ"/><input type="number" min="0" step="0.01" value={subscription.amount} onChange={e=>setSubscription({...subscription,amount:e.target.value})} placeholder="Suma EUR"/><button className="button-secondary"><Plus size={13}/>Uložiť</button></form>
    </div></section>
    <div className="home-grid">
      <section className="panel"><div className="idea-panel-heading"><CalendarClock size={17}/><div><h3>Najbližšie kontroly a servis</h3><p>Komín, STK, servis, prezutie a ďalšia opakovaná údržba.</p></div></div><div className="home-list">{overview?.maintenance.map(item=><article key={item._id}><span>{item.category.includes('VEHICLE')?<Car size={15}/>:<House size={15}/>}</span><div><strong>{item.title}</strong><small>{assetName.get(item.assetId)??item.assetId}{item.notes?` · ${item.notes}`:''}</small></div><time>{date(item.nextDueAt)}</time></article>)}</div>{overview&&overview.maintenance.length===0&&<Empty text="Termíny sa zobrazia po bezpečnom prvom naplnení registra."/>}</section>
      <section className="panel"><div className="idea-panel-heading"><Zap size={17}/><div><h3>Posledné odpočty</h3><p>ZSE elektrina a IMAZ voda; neskôr doplníme vývoj a odchýlky.</p></div></div><div className="home-list">{[...latestByAsset.values()].map(item=><article key={item._id}><span>{item.utility==='WATER'?<Droplets size={15}/>:<Zap size={15}/>}</span><div><strong>{assetName.get(item.assetId)??item.assetId}</strong><small>{date(item.recordedAt)}</small></div><b>{item.value.toLocaleString('sk-SK')} {item.unit}</b></article>)}</div>{overview&&latestByAsset.size===0&&<Empty text="Zatiaľ nie je uložený žiadny manuálny ani automatický odpočet."/>}</section>
      <section className="panel home-wide"><div className="idea-panel-heading"><ReceiptText size={17}/><div><h3>Predplatné a obnovy</h3><p>Prehľad ceny a najbližšieho obnovenia; zrušenie vždy vyžaduje tvoje potvrdenie.</p></div></div><div className="home-list subscriptions">{overview?.subscriptions.map(item=><article key={item._id}><span><ReceiptText size={15}/></span><div><strong>{item.name}</strong><small>{item.provider} · {item.billingCycle}</small></div><b>{item.amount!==undefined?`${item.amount.toLocaleString('sk-SK')} ${item.currency??'EUR'}`:'—'}</b><time>{date(item.nextRenewalAt)}</time></article>)}</div>{overview&&overview.subscriptions.length===0&&<Empty text="Predplatné sa doplnia z potvrdených zdrojov alebo manuálneho registra."/>}</section>
    </div>
  </div>
}

function Empty({text}:{text:string}){return <div className="connection-empty"><span><House size={18}/></span><div><strong>Zatiaľ bez dát</strong><p>{text}</p></div></div>}
