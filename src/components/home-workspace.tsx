import { makeFunctionReference } from 'convex/server'
import { useQuery } from 'convex/react'
import { CalendarClock, Car, Droplets, Gauge, House, ReceiptText, Zap } from 'lucide-react'

type Asset={_id:string;assetId:string;domain:string;kind:string;name:string;status:string}
type Maintenance={_id:string;assetId:string;category:string;title:string;nextDueAt:number;notes:string}
type Reading={_id:string;assetId:string;utility:string;recordedAt:number;value:number;unit:string}
type Subscription={_id:string;name:string;provider:string;amount?:number;currency?:string;billingCycle:string;nextRenewalAt?:number}
type Overview={assets:Asset[];maintenance:Maintenance[];readings:Reading[];subscriptions:Subscription[]}

const homeApi={overview:makeFunctionReference<'query',Record<string,never>,Overview>('homeWorkspace:overview')}
const date=(value?:number)=>value?new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',day:'numeric',month:'short',year:'numeric'}).format(value):'bez termínu'

export function HomeWorkspace(){
  const overview=useQuery(homeApi.overview,{})
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
    <div className="home-grid">
      <section className="panel"><div className="idea-panel-heading"><CalendarClock size={17}/><div><h3>Najbližšie kontroly a servis</h3><p>Komín, STK, servis, prezutie a ďalšia opakovaná údržba.</p></div></div><div className="home-list">{overview?.maintenance.map(item=><article key={item._id}><span>{item.category.includes('VEHICLE')?<Car size={15}/>:<House size={15}/>}</span><div><strong>{item.title}</strong><small>{assetName.get(item.assetId)??item.assetId}{item.notes?` · ${item.notes}`:''}</small></div><time>{date(item.nextDueAt)}</time></article>)}</div>{overview&&overview.maintenance.length===0&&<Empty text="Termíny sa zobrazia po bezpečnom prvom naplnení registra."/>}</section>
      <section className="panel"><div className="idea-panel-heading"><Zap size={17}/><div><h3>Posledné odpočty</h3><p>ZSE elektrina a IMAZ voda; neskôr doplníme vývoj a odchýlky.</p></div></div><div className="home-list">{[...latestByAsset.values()].map(item=><article key={item._id}><span>{item.utility==='WATER'?<Droplets size={15}/>:<Zap size={15}/>}</span><div><strong>{assetName.get(item.assetId)??item.assetId}</strong><small>{date(item.recordedAt)}</small></div><b>{item.value.toLocaleString('sk-SK')} {item.unit}</b></article>)}</div>{overview&&latestByAsset.size===0&&<Empty text="Zatiaľ nie je uložený žiadny manuálny ani automatický odpočet."/>}</section>
      <section className="panel home-wide"><div className="idea-panel-heading"><ReceiptText size={17}/><div><h3>Predplatné a obnovy</h3><p>Prehľad ceny a najbližšieho obnovenia; zrušenie vždy vyžaduje tvoje potvrdenie.</p></div></div><div className="home-list subscriptions">{overview?.subscriptions.map(item=><article key={item._id}><span><ReceiptText size={15}/></span><div><strong>{item.name}</strong><small>{item.provider} · {item.billingCycle}</small></div><b>{item.amount!==undefined?`${item.amount.toLocaleString('sk-SK')} ${item.currency??'EUR'}`:'—'}</b><time>{date(item.nextRenewalAt)}</time></article>)}</div>{overview&&overview.subscriptions.length===0&&<Empty text="Predplatné sa doplnia z potvrdených zdrojov alebo manuálneho registra."/>}</section>
    </div>
  </div>
}

function Empty({text}:{text:string}){return <div className="connection-empty"><span><House size={18}/></span><div><strong>Zatiaľ bez dát</strong><p>{text}</p></div></div>}
