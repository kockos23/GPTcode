import { useMemo, useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import {
  Archive, ArrowUpRight, BookOpen, Check, ChevronDown, FileText, Image as ImageIcon, Lightbulb,
  Link2, Mic, Rocket, Search, Sparkles, Star, Target, UserRound, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Stage = 'inbox' | 'library' | 'action' | 'archive'
type Framework = { name:string; whenToUse:string; steps:string[] }
type BusinessIdea = { title:string; problem:string; audience:string; firstStep:string }
type IdeaCapture = {
  id:string; sourceKey:string; source:string; kind:string; receivedAt:number; rawText:string; caption:string
  urls:string[]; fileName?:string; mimeType?:string; driveUrl?:string; analysisStatus:'ok'|'partial'|'failed'
  analysisIssues:string[]; title:string; summary:string; category:string; keyPoints:string[]; frameworks:Framework[]
  businessIdeas:BusinessIdea[]; relevanceScore:number; relevanceWhy:string; linkedFocus:string[]; nextActions:string[]
  tags:string[]; relatedCaptureIds:string[]; profileSignals:string[]; stage:Stage; starred:boolean; userNote?:string
  updatedAt:number; hasExtractedText:boolean
}
type Profile = { focusAreas:string[]; activeProjects:string[]; goals:string[]; openQuestions:string[]; avoid:string[]; isDefault:boolean; updatedAt:number|null }
type Digest = { id:string; title:string; summary:string; periodStart:number; periodEnd:number; themes:{ name:string; insight:string; captureIds:string[] }[]; topActions:string[]; businessBets:string[]; questions:string[]; captureCount:number }
type Overview = {
  counts:Record<Stage, number>; failed:number; themes:{ tag:string; count:number }[]
  signals:{ captureId:string; captureTitle:string; signal:string }[]; digest:Digest|null; profile:Profile
}
type ListArgs = { stage?:string; category?:string; search?:string; starredOnly?:boolean }
type ProfileArgs = Omit<Profile, 'isDefault'|'updatedAt'>

const ideaApi = {
  listCaptures: makeFunctionReference<'query', ListArgs, IdeaCapture[]>('ideaVault:listCaptures'),
  overview: makeFunctionReference<'query', Record<string, never>, Overview>('ideaVault:overview'),
  updateCapture: makeFunctionReference<'mutation', { id:string; stage?:Stage; starred?:boolean; userNote?:string; category?:string }, null>('ideaVault:updateCapture'),
  saveProfile: makeFunctionReference<'mutation', ProfileArgs, null>('ideaVault:saveProfile'),
  resolveProfileSignal: makeFunctionReference<'mutation', { captureId:string; signal:string; accept:boolean }, null>('ideaVault:resolveProfileSignal'),
}

// Persona of the Idea Vault agent. Set `portrait` to an image URL once the photo is ready.
export const VERA = { name:'VERA', role:'Idea Vault', portrait:'' }

export function VeraAvatar({ size=56 }: { size?:number }) {
  return <span className="vera-avatar" style={{ width:size, height:size }} aria-label={VERA.name+' · '+VERA.role}>
    {VERA.portrait ? <img src={VERA.portrait} alt={VERA.name} width={size} height={size} loading="lazy"/> : <span aria-hidden="true">V</span>}
  </span>
}

const stages: { id:Stage|'all'; label:string }[] = [
  { id:'inbox', label:'Nové' },
  { id:'action', label:'Na akciu' },
  { id:'library', label:'Knižnica' },
  { id:'archive', label:'Archív' },
  { id:'all', label:'Všetko' },
]
const categories = ['Know-how','Framework','Biznis nápad','Nástroj','Inšpirácia','Referencia','Úloha']
const kindIcons: Record<string, LucideIcon> = { link:Link2, image:ImageIcon, voice:Mic, document:FileText, text:Lightbulb, video:ImageIcon, other:FileText }

export function IdeaVaultView({ notify }: { notify:(message:string)=>void }) {
  const [stage, setStage] = useState<Stage|'all'>('inbox')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [starredOnly, setStarredOnly] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const overview = useQuery(ideaApi.overview, {})
  const captures = useQuery(ideaApi.listCaptures, {
    stage: stage === 'all' ? undefined : stage,
    category: category || undefined,
    search: search.trim() || undefined,
    starredOnly: starredOnly || undefined,
  })
  const resolveSignal = useMutation(ideaApi.resolveProfileSignal)

  return <div className="page idea-vault">
    <div className="page-intro vera-intro"><VeraAvatar/><div><p className="eyebrow">Idea Vault</p><h2>{VERA.name}</h2><p>Pošli VERE v Telegrame čokoľvek, čo ťa zaujme: odkaz, screenshot, fotku, PDF alebo hlasovku. VERA obsah prečíta, porovná s tým, čomu sa venuješ, a vytiahne know-how, frameworky aj biznis nápady. Tu ich triediš a pripravuješ na ďalšie použitie.</p></div></div>

    <div className="agent-metrics idea-metrics">
      <div><strong>{overview?.counts.inbox ?? '—'}</strong><span>nové na triedenie</span></div>
      <div><strong>{overview?.counts.action ?? '—'}</strong><span>na akciu</span></div>
      <div><strong>{overview?.counts.library ?? '—'}</strong><span>v knižnici</span></div>
      <div><strong>{overview?.failed ?? '—'}</strong><span>bez AI analýzy</span></div>
    </div>

    {overview?.digest && <DigestPanel digest={overview.digest}/>}

    {overview && overview.signals.length > 0 && <section className="panel idea-signals">
      <div className="idea-panel-heading"><Sparkles size={16}/><div><h3>VERA si všimla nové záujmy</h3><p>Potvrdené signály sa pridajú do tvojho profilu a ďalšie analýzy ich zohľadnia.</p></div></div>
      {overview.signals.map(item => <div className="idea-signal-row" key={item.captureId+item.signal}>
        <div><strong>{item.signal}</strong><small>z „{item.captureTitle}“</small></div>
        <div className="idea-row-actions">
          <button className="button-secondary" onClick={() => void resolveSignal({ captureId:item.captureId, signal:item.signal, accept:true }).then(() => notify('Pridané do profilu.'))}><Check size={13}/>Pridať</button>
          <button className="button-quiet" aria-label="Zamietnuť" onClick={() => void resolveSignal({ captureId:item.captureId, signal:item.signal, accept:false })}><X size={13}/></button>
        </div>
      </div>)}
    </section>}

    {overview && overview.themes.length > 0 && <div className="idea-themes" aria-label="Opakujúce sa témy">
      <span className="eyebrow">Témy za 30 dní</span>
      {overview.themes.map(theme => <button key={theme.tag} onClick={() => { setSearch('#'+theme.tag); setStage('all') }}>#{theme.tag}<small>{theme.count}</small></button>)}
    </div>}

    <div className="filter-row">
      {stages.map(item => <button key={item.id} className={stage === item.id ? 'active' : ''} onClick={() => setStage(item.id)}>{item.label}{item.id !== 'all' && overview ? <span>{overview.counts[item.id]}</span> : null}</button>)}
      <button className={starredOnly ? 'active' : ''} onClick={() => setStarredOnly(value => !value)}><Star size={12}/>Obľúbené</button>
    </div>
    <div className="idea-toolbar">
      <label className="search-box"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Hľadať v nápadoch, tagoch a poznámkach…"/></label>
      <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Kategória">
        <option value="">Všetky kategórie</option>
        {categories.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <button className="button-secondary" onClick={() => setProfileOpen(open => !open)}><UserRound size={13}/>Môj profil</button>
    </div>

    {profileOpen && overview && <ProfileEditor profile={overview.profile} onSaved={() => { setProfileOpen(false); notify('Profil je uložený. Ďalšie nápady sa vyhodnotia podľa neho.') }}/>}

    {captures === undefined && <div className="empty"><span><Lightbulb size={21}/></span><h3>Načítavam nápady…</h3><p>Chvíľu strpenia.</p></div>}
    {captures && captures.length === 0 && <div className="empty"><span><Lightbulb size={21}/></span><h3>Zatiaľ tu nič nie je</h3><p>Pošli VERE v Telegrame odkaz, fotku alebo hlasovku. Do minúty sa tu objaví spracovaný záznam.</p></div>}
    <div className="idea-list">{captures?.map(capture => <CaptureCard key={capture.id} capture={capture} notify={notify}/>)}</div>
  </div>
}

function DigestPanel({ digest }: { digest:Digest }) {
  const [open, setOpen] = useState(false)
  const range = new Date(digest.periodStart).toLocaleDateString('sk-SK', { day:'numeric', month:'numeric' })+' – '+new Date(digest.periodEnd).toLocaleDateString('sk-SK', { day:'numeric', month:'numeric', year:'numeric' })
  return <section className="panel idea-digest">
    <div className="idea-panel-heading"><BookOpen size={16}/><div><p className="eyebrow">Týždenný prehľad · {range} · {digest.captureCount} záznamov</p><h3>{digest.title}</h3></div></div>
    <p>{digest.summary}</p>
    {digest.topActions.length > 0 && <div className="idea-block"><strong>Čo urobiť ďalej</strong><ol>{digest.topActions.map(item => <li key={item}>{item}</li>)}</ol></div>}
    {open && <>
      {digest.themes.map(theme => <div className="idea-block" key={theme.name}><strong>{theme.name}</strong><p>{theme.insight}</p></div>)}
      {digest.businessBets.length > 0 && <div className="idea-block"><strong>Biznis stávky</strong><ul>{digest.businessBets.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {digest.questions.length > 0 && <div className="idea-block"><strong>Otázky na premyslenie</strong><ul>{digest.questions.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </>}
    <button className="text-link" onClick={() => setOpen(value => !value)}>{open ? 'Skryť detaily' : 'Témy, stávky a otázky'}</button>
  </section>
}

function CaptureCard({ capture, notify }: { capture:IdeaCapture; notify:(message:string)=>void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(capture.userNote ?? '')
  const update = useMutation(ideaApi.updateCapture)
  const Icon = kindIcons[capture.kind] ?? Lightbulb
  const move = (stage:Stage, message:string) => void update({ id:capture.id, stage }).then(() => notify(message))
  const received = new Date(capture.receivedAt).toLocaleString('sk-SK', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })
  const relevanceTone = capture.relevanceScore >= 70 ? 'high' : capture.relevanceScore >= 40 ? 'mid' : 'low'

  return <article className={'idea-card'+(capture.analysisStatus === 'failed' ? ' failed' : '')}>
    <button className="idea-card-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="agent-avatar"><Icon size={16}/></span>
      <div className="idea-card-copy">
        <p className="task-id">{capture.category} · {received}{capture.analysisStatus !== 'ok' && <em> · {capture.analysisStatus === 'failed' ? 'bez analýzy' : 'čiastočná analýza'}</em>}</p>
        <h3>{capture.starred && <Star size={13} className="idea-star"/>}{capture.title}</h3>
        {capture.summary && <p>{capture.summary}</p>}
        {capture.tags.length > 0 && <div className="idea-tags">{capture.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
      </div>
      <div className="idea-score" data-tone={relevanceTone} title={capture.relevanceWhy || 'Relevancia pre teba'}><strong>{capture.relevanceScore}</strong><small>relevancia</small></div>
      <ChevronDown size={16} className={'idea-chevron'+(open ? ' open' : '')}/>
    </button>

    {open && <div className="idea-card-body">
      {capture.relevanceWhy && <div className="idea-block why"><Target size={14}/><div><strong>Prečo je to pre teba</strong><p>{capture.relevanceWhy}</p>{capture.linkedFocus.length > 0 && <small>{capture.linkedFocus.join(' · ')}</small>}</div></div>}
      {capture.keyPoints.length > 0 && <div className="idea-block"><strong>Know-how</strong><ul>{capture.keyPoints.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {capture.frameworks.map(framework => <div className="idea-block framework" key={framework.name}><strong>Framework · {framework.name}</strong>{framework.whenToUse && <p>{framework.whenToUse}</p>}<ol>{framework.steps.map(step => <li key={step}>{step}</li>)}</ol></div>)}
      {capture.businessIdeas.map(idea => <div className="idea-block business" key={idea.title}><strong><Rocket size={13}/> {idea.title}</strong><dl><div><dt>Problém</dt><dd>{idea.problem}</dd></div><div><dt>Pre koho</dt><dd>{idea.audience || '—'}</dd></div><div><dt>Prvý krok</dt><dd>{idea.firstStep || '—'}</dd></div></dl></div>)}
      {capture.nextActions.length > 0 && <div className="idea-block"><strong>Ďalšie kroky</strong><ul>{capture.nextActions.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {(capture.rawText || capture.caption) && <div className="idea-block source"><strong>Pôvodná správa</strong><p>{capture.caption || capture.rawText}</p></div>}
      {capture.analysisIssues.length > 0 && <p className="idea-issues">Poznámka k analýze: {capture.analysisIssues.join('; ')}</p>}
      <div className="context-links">
        {capture.urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">{hostname(url)} <ArrowUpRight size={11}/></a>)}
        {capture.driveUrl && <a href={capture.driveUrl} target="_blank" rel="noreferrer">Originál v Drive <ArrowUpRight size={11}/></a>}
      </div>
      <label className="idea-note"><span>Moja poznámka</span><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} onBlur={() => { if (note !== (capture.userNote ?? '')) void update({ id:capture.id, userNote:note }).then(() => notify('Poznámka uložená.')) }} placeholder="Prečo ma to zaujalo, kde to použijem…"/></label>
      <div className="idea-row-actions">
        {capture.stage !== 'action' && <button className="button-primary" onClick={() => move('action', 'Presunuté na akciu.')}><Rocket size={13}/>Na akciu</button>}
        {capture.stage !== 'library' && <button className="button-secondary" onClick={() => move('library', 'Uložené do knižnice.')}><BookOpen size={13}/>Do knižnice</button>}
        <button className="button-secondary" onClick={() => void update({ id:capture.id, starred:!capture.starred })}><Star size={13}/>{capture.starred ? 'Odobrať' : 'Obľúbené'}</button>
        {capture.stage !== 'archive' && <button className="button-quiet" onClick={() => move('archive', 'Archivované.')}><Archive size={13}/>Archivovať</button>}
      </div>
    </div>}
  </article>
}

function ProfileEditor({ profile, onSaved }: { profile:Profile; onSaved:()=>void }) {
  const save = useMutation(ideaApi.saveProfile)
  const initial = useMemo(() => ({
    focusAreas: profile.focusAreas.join('\n'),
    activeProjects: profile.activeProjects.join('\n'),
    goals: profile.goals.join('\n'),
    openQuestions: profile.openQuestions.join('\n'),
    avoid: profile.avoid.join('\n'),
  }), [profile])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const fields: { key:keyof typeof draft; label:string; hint:string }[] = [
    { key:'focusAreas', label:'Čomu sa venujem', hint:'Oblasti, firmy, témy' },
    { key:'activeProjects', label:'Aktívne projekty', hint:'Na čo môžu nápady priamo nadviazať' },
    { key:'goals', label:'Ciele', hint:'Čo chcem dosiahnuť v najbližších mesiacoch' },
    { key:'openQuestions', label:'Nad čím uvažujem', hint:'Otvorené otázky a rozhodnutia' },
    { key:'avoid', label:'Čo ma nezaujíma', hint:'Témy, ktoré má agent hodnotiť nízko' },
  ]
  const lines = (value:string) => value.split('\n').map(line => line.trim()).filter(Boolean)
  const submit = async () => {
    setSaving(true)
    try {
      await save({ focusAreas:lines(draft.focusAreas), activeProjects:lines(draft.activeProjects), goals:lines(draft.goals), openQuestions:lines(draft.openQuestions), avoid:lines(draft.avoid) })
      onSaved()
    } finally { setSaving(false) }
  }
  return <section className="panel idea-profile">
    <div className="idea-panel-heading"><UserRound size={16}/><div><h3>Čo o tebe VERA vie</h3><p>{profile.isDefault ? 'Predvyplnené z registra projektov. Uprav a ulož.' : 'Každý riadok je jedna položka. VERA to zohľadní pri každej analýze.'}</p></div></div>
    <div className="idea-profile-grid">{fields.map(field => <label key={field.key}><span>{field.label}</span><small>{field.hint}</small><textarea rows={5} value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]:event.target.value }))}/></label>)}</div>
    <div className="idea-row-actions"><button className="button-primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Ukladám…' : 'Uložiť profil'}</button></div>
  </section>
}

function hostname(url:string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'odkaz' }
}
