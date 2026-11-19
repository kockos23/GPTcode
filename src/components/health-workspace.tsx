import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { Activity, BatteryCharging, Check, HeartPulse, Moon, Plus, Sparkles } from 'lucide-react'

type Habit={_id:string;habitId:string;name:string;category:string;target:number;unit:string}
type Daily={_id:string;date:string;metrics:Record<string,number|undefined>}
type Checkin={_id:string;date:string;mood?:number;energy?:number;soreness?:number;perceivedStress?:number;sleepQuality?:number;note:string}
type Supplement={_id:string;date:string;name:string;dose:number;unit:string;takenAt?:number;note:string}
type Overview={daily:Daily[];habits:Habit[];checkins:Checkin[];logs:unknown[];supplements:Supplement[]}

const healthApi={
  overview:makeFunctionReference<'query',Record<string,never>,Overview>('healthWorkspace:overview'),
  saveCheckin:makeFunctionReference<'mutation',{date:string;mood?:number;energy?:number;soreness?:number;perceivedStress?:number;sleepQuality?:number;note:string},{ok:boolean}>('healthWorkspace:saveCheckin'),
  saveHabit:makeFunctionReference<'mutation',{name:string;category:string;target:number;unit:string},{ok:boolean;habitId:string}>('healthWorkspace:saveHabit'),
  logHabit:makeFunctionReference<'mutation',{habitId:string;date:string;value:number;completed:boolean;note:string},{ok:boolean}>('healthWorkspace:logHabit'),
  saveSupplement:makeFunctionReference<'mutation',{date:string;name:string;dose:number;unit:string;takenAt?:number;note:string},{ok:boolean;logId:string}>('healthWorkspace:saveSupplement'),
}

const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava'}).format(new Date())
const scoreOptions=<>{[1,2,3,4,5,6,7,8,9,10].map(value=><option key={value} value={value}>{value}</option>)}</>

export function HealthWorkspace({notify}:{notify:(message:string)=>void}){
  const overview=useQuery(healthApi.overview,{})
  const saveCheckin=useMutation(healthApi.saveCheckin)
  const saveHabit=useMutation(healthApi.saveHabit)
  const logHabit=useMutation(healthApi.logHabit)
  const saveSupplement=useMutation(healthApi.saveSupplement)
  const [form,setForm]=useState({date:today(),mood:'',energy:'',soreness:'',perceivedStress:'',sleepQuality:'',note:''})
  const [habit,setHabit]=useState({name:'',category:'WELLBEING',target:'1',unit:'krát'})
  const [supplement,setSupplement]=useState({name:'',dose:'',unit:'mg',note:''})
  const latest=overview?.daily[0]
  const number=(value:string)=>value?Number(value):undefined
  const submitCheckin=async()=>{
    await saveCheckin({date:form.date,mood:number(form.mood),energy:number(form.energy),soreness:number(form.soreness),perceivedStress:number(form.perceivedStress),sleepQuality:number(form.sleepQuality),note:form.note})
    notify('Denný zdravotný check-in je uložený.')
  }
  const submitHabit=async()=>{
    if(!habit.name.trim())return
    await saveHabit({name:habit.name,category:habit.category,target:Number(habit.target),unit:habit.unit})
    setHabit({name:'',category:'WELLBEING',target:'1',unit:'krát'});notify('Nový návyk je pripravený na sledovanie.')
  }
  const submitSupplement=async()=>{
    if(!supplement.name.trim()||!Number(supplement.dose))return
    await saveSupplement({date:today(),name:supplement.name,dose:Number(supplement.dose),unit:supplement.unit,note:supplement.note})
    setSupplement({name:'',dose:'',unit:'mg',note:''});notify('Suplement je zaznamenaný v dnešnom denníku.')
  }
  return <div className="page health-workspace">
    <div className="page-intro"><div><p className="eyebrow">Zdravie · výkon · návyky</p><h2>Health & Performance</h2><p>Spoločný pohľad na tréning, spánok, regeneráciu, subjektívny stav, návyky a suplementy. Odporúčania sú podpora rozhodovania, nie zdravotná diagnóza.</p></div></div>
    <div className="health-metric-grid">
      <article><Moon/><small>Posledný spánok</small><strong>{latest?.metrics.sleepMinutes?`${(latest.metrics.sleepMinutes/60).toFixed(1)} h`:'—'}</strong></article>
      <article><HeartPulse/><small>Pokojový tep</small><strong>{latest?.metrics.restingHeartRate?`${latest.metrics.restingHeartRate} bpm`:'—'}</strong></article>
      <article><BatteryCharging/><small>Body Battery max</small><strong>{latest?.metrics.bodyBatteryHigh??'—'}</strong></article>
      <article><Activity/><small>Kroky</small><strong>{latest?.metrics.steps?.toLocaleString('sk-SK')??'—'}</strong></article>
    </div>
    <div className="nora-columns">
      <section className="panel"><div className="idea-panel-heading"><Sparkles size={17}/><div><h3>Denný check-in</h3><p>1–10; vyplň len to, čo chceš sledovať.</p></div></div>
        <div className="health-checkin-form"><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>{(['mood','energy','soreness','perceivedStress','sleepQuality'] as const).map(key=><label key={key}><span>{{mood:'Nálada',energy:'Energia',soreness:'Svalová únava',perceivedStress:'Vnímaný stres',sleepQuality:'Kvalita spánku'}[key]}</span><select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}><option value="">—</option>{scoreOptions}</select></label>)}<textarea rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Poznámka: choroba, alkohol, cestovanie, náročný deň…"/><button className="button-primary" onClick={()=>void submitCheckin()}>Uložiť check-in</button></div>
      </section>
      <section className="panel"><div className="idea-panel-heading"><Check size={17}/><div><h3>Návyky</h3><p>Neskôr ich vyhodnotíme spolu so spánkom a tréningom.</p></div></div>
        <div className="health-habit-add"><input value={habit.name} onChange={e=>setHabit({...habit,name:e.target.value})} placeholder="Napr. bez alkoholu, mobilita, meditácia"/><input type="number" min="0" step="0.1" value={habit.target} onChange={e=>setHabit({...habit,target:e.target.value})}/><input value={habit.unit} onChange={e=>setHabit({...habit,unit:e.target.value})}/><button className="button-secondary" onClick={()=>void submitHabit()}><Plus size={14}/>Pridať</button></div>
        <div className="health-habit-list">{overview?.habits.map(item=><article key={item._id}><div><strong>{item.name}</strong><small>{item.target} {item.unit} denne</small></div><button className="button-quiet" onClick={()=>void logHabit({habitId:item.habitId,date:today(),value:item.target,completed:true,note:''}).then(()=>notify(`Návyk „${item.name}“ je zaznamenaný.`))}><Check size={14}/>Dnes splnené</button></article>)}</div>
        {overview&&overview.habits.length===0&&<div className="connection-empty"><span><Activity size={18}/></span><div><strong>Zatiaľ bez návykov</strong><p>Začni 2–4 návykmi, ktoré chceš reálne sledovať.</p></div></div>}
        <div className="health-supplement-section"><div className="idea-panel-heading"><Plus size={16}/><div><h3>Suplementy</h3><p>Evidencia dávky; bez automatických zdravotných tvrdení.</p></div></div><div className="health-supplement-add"><input value={supplement.name} onChange={e=>setSupplement({...supplement,name:e.target.value})} placeholder="Názov"/><input type="number" min="0" step="0.1" value={supplement.dose} onChange={e=>setSupplement({...supplement,dose:e.target.value})} placeholder="Dávka"/><input value={supplement.unit} onChange={e=>setSupplement({...supplement,unit:e.target.value})} placeholder="Jednotka"/><input value={supplement.note} onChange={e=>setSupplement({...supplement,note:e.target.value})} placeholder="Poznámka (voliteľná)"/><button className="button-secondary" onClick={()=>void submitSupplement()}><Plus size={14}/>Zapísať</button></div><div className="health-supplement-list">{overview?.supplements.slice(0,8).map(item=><div key={item._id}><strong>{item.name}</strong><span>{item.dose} {item.unit}</span><small>{item.date}</small></div>)}</div></div>
      </section>
    </div>
  </div>
}
