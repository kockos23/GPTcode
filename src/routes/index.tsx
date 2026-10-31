import { createFileRoute } from '@tanstack/react-router'
import { makeFunctionReference } from 'convex/server'
import { useAction } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AuthGate, SignOutButton } from '@/components/auth-gate'
import { api } from '@/convex/_generated/api'
import {
  AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, BellRing, Bot, CalendarDays,
  Check, ChevronRight, CircleCheckBig, Clock3, Command, FileQuestion, FolderKanban,
  Inbox, LayoutDashboard, ListChecks, Mail, Menu, MessageSquareText, MoreHorizontal,
  Pause, PlugZap, Plus, RefreshCw, Search, Send, SlidersHorizontal, Sparkles, Target, X,
  Link2,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: ProtectedChiefOfStaffHQ })

function ProtectedChiefOfStaffHQ() {
  return <AuthGate><ChiefOfStaffHQ/></AuthGate>
}

type View = 'home' | 'decisions' | 'projects' | 'tasks' | 'agents' | 'finance' | 'more'
type Priority = 'P0' | 'P1' | 'P2'
type ProjectStatus = 'Aktívny' | 'Plánovaný' | 'Čaká' | 'Pozastavený'
type DecisionStatus = 'Čaká na Tomáša' | 'Schválené' | 'Odložené' | 'Podklady vyžiadané' | 'Vlastná odpoveď'
type TaskStatus = 'Nové' | 'Rozpracované' | 'Hotové' | 'Čaká'

type Project = {
  id: string; area: string; name: string; status: ProjectStatus; priority: Priority
  owner: string; horizon: string; deadline?: string; nextAction: string
  blocker?: string; waitingFor?: string; progress: number
}
type Decision = {
  id: string; projectId: string; question: string; recommendation: string
  alternatives: string[]; reason: string; impact: string; deadline: string
  status: DecisionStatus; context: string; source: string; relatedTask?: string
  answer?: string
}
type AITask = {
  id: string; projectId: string; title: string; assignee: string; output: string
  deadline?: string; status: TaskStatus; approval: string
}
type LiveAgent = {
  id:string; name:string; role:string; connection:string; status:string; lastCheck:string
  currentTask:string; nextStep:string; owner:string; notes:string
}
type LiveWorkItem = {
  id:string; projectId:string; title:string; owner:string; priority:string; status:string
  updated:string; deadline:string; expectedOutput:string; result:string; nextAgent:string
  approval:string; error:string; notes:string
}
type LiveTask = {
  id:string; created:string; source:string; title:string; details:string; projectId:string
  owner:string; priority:string; status:string; deadline:string; reminder:string
  recurrence:string; related:string; result:string; updated:string
}
type LiveCommand = {
  id:string; received:string; channel:string; contextType:string; contextId:string
  command:string; intent:string; targetApp:string; approval:string; status:string
  agent:string; result:string; error:string; runId:string; updated:string
}
type LiveBriefing = {
  generatedAt: number
  calendar: { id:string; title:string; start:string; end:string; allDay:boolean; url:string }[]
  emails: { id:string; threadId:string; subject:string; sender:string; timestamp:string; preview:string; url:string; important:boolean }[]
  agents: LiveAgent[]
  workQueue: LiveWorkItem[]
  tasks: LiveTask[]
  commands: LiveCommand[]
  sourceErrors: string[]
}
type BriefingState = 'idle' | 'loading' | 'ready' | 'error'
type WofPayable = {
  id:string; kind:string; documentStatus:string; supplier:string; invoiceNumber:string
  dueDate:string; amount:string; currency:string; paymentMethod:string; paymentStatus:string
  transactionId:string; fileUrl:string; note:string; paidAmount?:string; paymentHistory?:string
}
type WofPayablesResult = { ok:boolean; code:string; message:string; updatedAt:number; rows:WofPayable[] }
type WofPayableGroup = { primary:WofPayable; documents:WofPayable[] }
type ManualPayableArgs = {
  supplier:string; purpose:string; dueDate:string; amount:number; currency:string
  paymentMethod:string; invoiceDate?:string; deliveryDate:string; invoiceNumber?:string
}
type ManualPayableResult = { ok:boolean; code:string; message:string; id:string }
type ManualPaymentArgs = { documentIds:string[]; paymentDate:string; amount:number; reference?:string; note?:string }
type ManualPaymentResult = { ok:boolean; code:string; message:string }
type BankStatementRecord = { id:string; sourceFileId:string; sourceFileName:string; sourceFileUrl:string; pdfFileId?:string; pdfFileName?:string; accountKey:string; accountLabel:string; currency:string; accountNumberMasked:string; statementNumber:string; periodStart:string; periodEnd:string; openingBalance:number; closingBalance:number; incomeTotal:number; expenseTotal:number; transactionCount:number; duplicateCount:number; importedAt:number; status:string }
type BankTransactionRecord = { id:string; statementId:string; accountKey:string; operationId:string; bookedOn:string; amount:number; currency:string; counterpartyAccount:string; counterpartyName:string; bankName:string; constantSymbol:string; variableSymbol:string; specificSymbol:string; note:string; recipientMessage:string; transactionType:string; bic:string; instructionId:string; matchStatus:string; matchedPayableId:string; matchScore?:number; matchReason?:string }
type BankStatementsResult = { statements:BankStatementRecord[]; transactions:BankTransactionRecord[] }
type BankMatchResult = { ok:boolean; message:string; evaluated:number; proposed:number }
type BankMatchActionResult = { ok:boolean; message:string }
type FinanceCategory = 'Doklady'|'Stripe'|'Vypisy'|'Vystavene_FA'
type FinanceReview = { id:string; documentId:string; source:string; sourceFileId:string; sourceFileName:string; fileUrl:string; supplier:string; invoiceNumber:string; totalAmount?:number; extractedDeliveryDate?:string; extractedCategory?:string; extractedCurrency?:string; reviewReason:string; status:string; resolvedDeliveryDate?:string; resolvedCategory?:string; resolvedCurrency?:string; completionError?:string; updatedAt:number }
type FinanceReviewResolveResult = { ok:boolean; message:string; status:string }
type FinanceHealth = { ok:boolean; checkedAt:number; issues:string[]; register:{updatedAt:number|null;payableCount:number}; commands:{pending:number;processing:number;failed:number;oldestPendingAt:number|null;oldestProcessingAt:number|null}; reviews:{ready:number;required:number;failed:number}; bank:{lastImportedAt:number|null;statementCountKnown:boolean;processing:number;oldestProcessingAt:number|null}; billdu:{processing:number;failed:number;oldestProcessingAt:number|null} }
const FINANCE_HEALTH_LABELS:Record<string,string>={REGISTER_NEVER_SYNCED:'register ešte nebol synchronizovaný',REGISTER_STALE:'register je neaktuálny',COMMAND_PENDING_TOO_LONG:'príkaz čaká príliš dlho',COMMAND_LEASE_EXPIRED:'spracovanie príkazu sa prerušilo',COMMAND_FAILED:'zlyhal zápis do registra',REVIEW_FAILED:'zlyhalo dokončenie review',BILLDU_LEASE_EXPIRED:'Billdu import zostal rozpracovaný',BILLDU_IMPORT_FAILED:'Billdu import zlyhal',BANK_IMPORT_STUCK:'bankový import zostal rozpracovaný'}
const bankStatementsApi = {
  listBankStatements: makeFunctionReference<'action', Record<string, never>, BankStatementsResult>('bankStatements:listBankStatements'),
  proposePaymentMatches: makeFunctionReference<'action', Record<string, never>, BankMatchResult>('bankStatements:proposePaymentMatches'),
  confirmPaymentMatch: makeFunctionReference<'action', { transactionId:string }, BankMatchActionResult>('bankStatements:confirmPaymentMatch'),
  rejectPaymentMatch: makeFunctionReference<'action', { transactionId:string }, BankMatchActionResult>('bankStatements:rejectPaymentMatch'),
}
const financeReviewsApi = {
  listFinanceReviews: makeFunctionReference<'action', Record<string, never>, FinanceReview[]>('financeReviews:listFinanceReviews'),
  resolveFinanceReview: makeFunctionReference<'action', { id:string; deliveryDate:string; category:FinanceCategory; currency?:string; note?:string }, FinanceReviewResolveResult>('financeReviews:resolveFinanceReview'),
}
const financeHealthApi = {
  getFinanceHealth: makeFunctionReference<'action', Record<string, never>, {allowed:boolean;health:FinanceHealth|null}>('financeHealth:getFinanceHealth'),
}
const wofFinanceApi = {
  listPayables: makeFunctionReference<'action', { force?: boolean }, WofPayablesResult>('wofFinance:listPayables'),
  addManualPayable: makeFunctionReference<'action', ManualPayableArgs, ManualPayableResult>('financeCommands:addManualPayable'),
  markPayablePaidManually: makeFunctionReference<'action', ManualPaymentArgs, ManualPaymentResult>('financeCommands:markPayablePaidManually'),
}

const priorityMeta: Record<Priority, { label: string; description: string }> = {
  P0: { label: 'Teraz', description: 'Vyžaduje pozornosť teraz' },
  P1: { label: 'Dôležité', description: 'Dôležitá aktívna priorita' },
  P2: { label: 'Neskôr', description: 'Nie je potrebné riešiť teraz' },
}

const saraPortrait = 'https://assets.macaly-user-data.dev/yZYv-7lt1FKxV0lpzqrWv3Gn/s9rj1345yz8hlofl1inrkhkw/mYan0mv_xchNlDAZVUcp3/sara-wof-finance-238jdilu.png'

function AssistantAvatar({ id }: { id:string }) {
  return <span className="agent-avatar">{id==='WOF_FIN'?<img src={saraPortrait} alt="SARA — WOF Finance" width={36} height={36} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}} loading="lazy"/>:<Bot size={17}/>}</span>
}

const directAssistants = [
  { id:'NORA', name:'NORA', role:'Chief of Staff', hint:'Všeobecné, komplexné a medziodborové úlohy' },
  { id:'WOF_FIN', name:'SARA', role:'WOF Finance', hint:'Doklady, faktúry, výpisy a účtovníčka' },
  { id:'FIRMA2_FIN', name:'Firma 2 Finance', role:'Oddelené financie', hint:'Doklady a účtovníctvo druhej firmy' },
  { id:'WOF_OPS', name:'WOF Operations', role:'Prevádzka WOF', hint:'Členovia, eventy, dodávatelia a onboarding' },
  { id:'NIKE_LOCAL', name:'Nike Assistant', role:'Lokálny handoff', hint:'Nike úlohy cez autorizovaný počítač' },
  { id:'RESEARCH', name:'Research', role:'Výskum', hint:'Analýzy, monitoring a porovnania' },
  { id:'BUILD_TECH', name:'Build & Tech', role:'Realizácia', hint:'Codex, Claude Code, Cursor, Macaly a Lovable' },
] as const

const projects: Project[] = [
  { id:'P001', area:'WOF', name:'Athens 2026 – closeout', status:'Aktívny', priority:'P0', owner:'Tomáš', horizon:'Teraz', deadline:'31. 10. 2026', nextAction:'Uzavrieť follow-up, náklady a lessons learned.', blocker:'Chýba finálny finančný prehľad.', waitingFor:'Tomáš + WOF tím', progress:72 },
  { id:'P002', area:'WOF', name:'Rome 2027', status:'Plánovaný', priority:'P0', owner:'Tomáš', horizon:'Q4 2026', nextAction:'Potvrdiť rámec, rozpočet a kľúčových partnerov.', blocker:'Rozhodnutie o rozsahu a termíne.', waitingFor:'Tomáš', progress:18 },
  { id:'P003', area:'Produkty', name:'WOF Event Platform', status:'Aktívny', priority:'P0', owner:'Tomáš + AI', horizon:'Q4 2026', nextAction:'Schváliť MVP rozsah a technický stack.', blocker:'Nevybraný MVP variant.', waitingFor:'Tomáš', progress:28 },
  { id:'P004', area:'Produkty', name:'Networking Product', status:'Plánovaný', priority:'P1', owner:'Tomáš + AI', horizon:'2027', nextAction:'Spísať problém, ICP a tri testovacie scenáre.', blocker:'Priorita voči Event Platform.', waitingFor:'Tomáš', progress:12 },
  { id:'P005', area:'WOF', name:'Alliance growth', status:'Aktívny', priority:'P1', owner:'Tomáš', horizon:'Q4 2026', nextAction:'Zostaviť pipeline partnerov a follow-up rytmus.', waitingFor:'WOF tím', progress:42 },
  { id:'P006', area:'WOF', name:'CRM & web ecosystem', status:'Aktívny', priority:'P0', owner:'Tomáš + AI', horizon:'Q4 2026', nextAction:'Zmapovať súčasné systémy a navrhnúť jednotný tok dát.', blocker:'Roztrieštené zdroje dát.', waitingFor:'Tomáš', progress:34 },
  { id:'P007', area:'AI', name:'WOF Growth Agent', status:'Plánovaný', priority:'P1', owner:'AI', horizon:'Q1 2027', nextAction:'Definovať vstupy, výstupy a pravidlá agenta.', progress:15 },
  { id:'P008', area:'Podnikanie', name:'AI agency / coaching', status:'Plánovaný', priority:'P1', owner:'Tomáš + AI', horizon:'Q1 2027', nextAction:'Vybrať prvú ponuku a cieľový segment.', blocker:'Príliš široký záber.', waitingFor:'Tomáš', progress:10 },
  { id:'P009', area:'Podnikanie', name:'Small SaaS portfolio', status:'Plánovaný', priority:'P2', owner:'AI', horizon:'2027', nextAction:'Zoradiť nápady podľa distribúcie a rýchlosti validácie.', progress:8 },
  { id:'P010', area:'Investície', name:'Acquisition opportunities', status:'Čaká', priority:'P2', owner:'Tomáš', horizon:'Priebežne', nextAction:'Vytvoriť acquisition scorecard.', blocker:'Bez aktívnej príležitosti.', progress:5 },
  { id:'P011', area:'Osobné', name:'RPM / osobný operačný systém', status:'Aktívny', priority:'P1', owner:'Tomáš + AI', horizon:'Teraz', nextAction:'Prepojiť ciele, týždenný review a denný focus.', progress:38 },
  { id:'P012', area:'Osobné', name:'Šport a zdravie', status:'Aktívny', priority:'P1', owner:'Tomáš', horizon:'Priebežne', nextAction:'Nastaviť jednoduchý týždenný tracking.', progress:45 },
  { id:'P013', area:'Osobné', name:'Travel planning', status:'Aktívny', priority:'P2', owner:'Tomáš + AI', horizon:'Priebežne', nextAction:'Konsolidovať otvorené cesty a rezervácie.', progress:30 },
  { id:'P014', area:'Osobné', name:'Home & family admin', status:'Aktívny', priority:'P2', owner:'Tomáš', horizon:'Priebežne', nextAction:'Spísať otvorené položky do jedného backlogu.', progress:26 },
  { id:'P015', area:'Niké', name:'Niké agenda', status:'Aktívny', priority:'P1', owner:'Tomáš', horizon:'Priebežne', nextAction:'Doplniť kontext z mailu a kalendára.', blocker:'Prístup iba cez druhý PC.', waitingFor:'Tomáš', progress:22 },
  { id:'P016', area:'AI', name:'Chief of Staff System', status:'Aktívny', priority:'P0', owner:'Tomáš + AI', horizon:'Teraz', nextAction:'Prejsť nový GPT index, potvrdiť statusy a prepojiť vybrané témy do živého registra.', blocker:'Kompletný GPT import je hotový; čaká sa na Tomášovu revíziu statusov.', waitingFor:'Tomáš', progress:86 },
  { id:'P017', area:'WOF Governance', name:'WOF OITA, hlasovania a onboarding shareholderov', status:'Aktívny', priority:'P0', owner:'Tomáš + WOF ops', horizon:'Okamžite', nextAction:'Založiť case register pre Kire, LMP Pakistan, Molapo, Kosovo a Joe Fogarty.', blocker:'Roztrúsené podpisy, notárske kroky, doklady a bankové údaje.', waitingFor:'Tomáš / WOF ops', progress:20 },
  { id:'P018', area:'Kariéra', name:'Radar pracovných ponúk CZ/SK', status:'Aktívny', priority:'P1', owner:'Claude rutina + Tomáš', horizon:'Denne', nextAction:'Ponechať fungujúcu Claude rutinu a synchronizovať iba stav a rozhodnutia.', blocker:'Treba určiť domovský systém a pravidlo synchronizácie.', waitingFor:'Tomáš', progress:55 },
  { id:'P019', area:'WOF Finance', name:'WOF Management Finance Dashboard', status:'Čaká', priority:'P1', owner:'Tomáš + finance + AI', horizon:'30–60 dní', nextAction:'Rozhodnúť o read-only MVP: jeden FIO účet, Billdu a kategorizácia transakcií.', blocker:'Chýba potvrdený scope, owner financií a prístupy.', waitingFor:'Tomáš / finance', progress:8 },
  { id:'P020', area:'Podnikanie', name:'Vyzuj papuče – stratégia a sponzoring', status:'Čaká', priority:'P1', owner:'Tomáš + project owner', horizon:'30 dní', nextAction:'Potvrdiť primárny cieľ: rast kurzov, ziskovosť, sponzori alebo delegovanie prevádzky.', blocker:'Nejasný cieľ a aktuálny status projektu.', waitingFor:'Tomáš', progress:10 },
  { id:'P021', area:'Klient / benchmark', name:'Lori Scout – automatizovaný sales a marketing', status:'Čaká', priority:'P2', owner:'Tomáš', horizon:'Na kontrolu', nextAction:'Potvrdiť, či ide o aktívneho klienta, partnera, interný benchmark alebo archív.', blocker:'Aktuálna relevancia nie je potvrdená.', waitingFor:'Tomáš', progress:5 },
]

const initialDecisions: Decision[] = [
  { id:'D001', projectId:'P016', question:'Použiť Google Sheet ako zdroj pravdy pre prvú verziu?', recommendation:'Áno. Sheet ostane zdrojom dát a dashboard bude používateľská vrstva.', alternatives:['Notion ako databáza','Vlastná databáza od začiatku'], reason:'Najrýchlejšia cesta bez migrácie existujúcich dát.', impact:'Systém môžeme používať okamžite a databázu riešiť podľa reálnej potreby.', deadline:'20. 10. 2026', status:'Schválené', context:'Rozhodnutie určuje, kde budú počas pilotu uložené projekty, rozhodnutia a AI úlohy.', source:'Návrh architektúry Chief of Staff' },
  { id:'D002', projectId:'P003', question:'Aký rozsah má mať MVP Event Platform?', recommendation:'Začať registráciou, programom, networking profilom a admin prehľadom.', alternatives:['Iba registračný modul','Kompletná event platforma'], reason:'Dáva hodnotu na reálny pilot bez veľkého technického rizika.', impact:'Určí čas, rozpočet a výber nástroja pre prvý prototyp.', deadline:'23. 10. 2026', status:'Čaká na Tomáša', context:'Ide o prvú verziu platformy pre WOF eventy. Má zjednotiť registráciu a základný networking; pilotom môže byť AGM Rím 2027 pre približne 100 až 120 účastníkov.', source:'WOF Event Platform + Networking Platform', relatedTask:'H005' },
  { id:'D003', projectId:'P002', question:'Kedy a v akom rozsahu odštartovať Rome 2027?', recommendation:'Potvrdiť pracovný termín a spustiť partner outreach ešte v Q4.', alternatives:['Počkať na január','Spustiť iba venue scouting'], reason:'Partneri a venue potrebujú dlhý lead time.', impact:'Ovplyvní dostupnosť lokality, partnerov aj cash flow.', deadline:'25. 10. 2026', status:'Čaká na Tomáša', context:'AGM WOF Alliance je plánované v Ríme na 15.–17. septembra 2027. Potrebujeme web, ticketing, venue a partnerov.', source:'AGM Rím 2027', relatedTask:'H004' },
  { id:'D004', projectId:'P006', question:'Ktorý CRM smer preveriť ako prvý?', recommendation:'Najprv audit procesov, potom krátky shortlist HubSpot, Attio a Pipedrive.', alternatives:['Nasadiť HubSpot ihneď','Postaviť vlastné CRM'], reason:'Nástroj bez procesného auditu iba zabetónuje chaos.', impact:'Zjednotí partnerov, eventy, follow-up a reporting.', deadline:'27. 10. 2026', status:'Čaká na Tomáša', context:'WOF má kontakty a procesy rozdelené medzi web, e-mail, tabuľky a eventové nástroje. Najprv potrebujeme vedieť, čo má CRM reálne obsluhovať.', source:'WOF CRM a web ecosystem', relatedTask:'H006' },
  { id:'D005', projectId:'P008', question:'Ktorou AI ponukou začať?', recommendation:'Produktizovaný AI workflow audit a následná 30-dňová implementácia.', alternatives:['Individuálny coaching','Full-service AI agentúra'], reason:'Má jasný výstup, kratší predajný cyklus a dá sa opakovať.', impact:'Definuje positioning, web a prvých pilotných klientov.', deadline:'30. 10. 2026', status:'Čaká na Tomáša', context:'Hľadáme prvú predajnú ponuku, ktorá využije tvoju marketingovú a coachingovú skúsenosť a nebude vyžadovať širokú agentúrnu prevádzku.', source:'AI agency / coaching', relatedTask:'H007' },
  { id:'D006', projectId:'P011', question:'Aký rytmus má mať osobný review?', recommendation:'10 minút denne, 45 minút týždenne a 90 minút mesačne.', alternatives:['Iba týždenný review','Denný detailný planning'], reason:'Udržateľný rytmus s nízkou administratívou.', impact:'Znižuje stratu kontextu a drží priority aktuálne.', deadline:'22. 10. 2026', status:'Čaká na Tomáša', context:'Ide o osobný systém založený na RPM: denný focus, týždenné vyhodnotenie a mesačné preladenie cieľov.', source:'RPM / osobný operačný systém', relatedTask:'H008' },
  { id:'D007', projectId:'P016', question:'Ktorý kanál bude hlavný vstup pre Chief of Staff?', recommendation:'ChatGPT ako riadiace rozhranie, dashboard ako prehľad a Sheet ako zdroj.', alternatives:['Claude ako hlavné rozhranie','Samostatná mobilná aplikácia'], reason:'ChatGPT má dnes najširší prístup ku konektorom a histórii.', impact:'Určí, kam pôjdu nové požiadavky a schvaľovania.', deadline:'21. 10. 2026', status:'Čaká na Tomáša', context:'Používaš ChatGPT aj Claude a potrebuješ jeden stabilný vstup, aby sa úlohy nestrácali medzi nástrojmi.', source:'Chief of Staff operating model', relatedTask:'H009' },
  { id:'D008', projectId:'P016', question:'Kedy prepnúť zo snapshotu na živú synchronizáciu?', recommendation:'Po 5 až 7 dňoch používania, keď bude jasné, ktoré polia a akcie potrebuješ.', alternatives:['Zapnúť live sync hneď','Ostať pri manuálnom update'], reason:'Najprv overíme rozhranie a potom automatizujeme stabilný proces.', impact:'Zabráni vývoju integrácie, ktorú by sme následne prerábali.', deadline:'28. 10. 2026', status:'Čaká na Tomáša', context:'Dashboard dnes používa overený snapshot. Po krátkom pilote môžeme zapojiť obojsmerný zápis do dátového zdroja.', source:'Chief of Staff V1', relatedTask:'H009' },
]

const aiTasks: AITask[] = [
  { id:'H001', projectId:'P016', title:'Vytvoriť Master Project Register', assignee:'ChatGPT', output:'21 projektov v jednotnom registri', status:'Hotové', approval:'Schválené' },
  { id:'H002', projectId:'P016', title:'Importovať a deduplikovať Claude export', assignee:'ChatGPT', output:'Konsolidovaný inventár tém z Claude', status:'Hotové', approval:'Schválené' },
  { id:'H003', projectId:'P016', title:'Vytvoriť Decision Queue a AI Handoff Inbox', assignee:'ChatGPT', output:'Rozhodnutia a delegované úlohy v Sheete', status:'Hotové', approval:'Schválené' },
  { id:'H004', projectId:'P001', title:'Pripraviť Athens closeout checklist', assignee:'Claude', output:'Checklist follow-upov, financií a lessons learned', deadline:'22. 10. 2026', status:'Nové', approval:'Nie je potrebné' },
  { id:'H005', projectId:'P003', title:'Navrhnúť tri varianty MVP Event Platform', assignee:'Codex', output:'Rozsah, stack, odhad času a riziká', deadline:'23. 10. 2026', status:'Nové', approval:'Tomáš vyberie variant' },
  { id:'H006', projectId:'P006', title:'Zmapovať WOF CRM a webový dátový tok', assignee:'Claude Code', output:'Mapa systémov, duplicít a odporúčaný tok', deadline:'26. 10. 2026', status:'Nové', approval:'Tomáš schváli smer' },
  { id:'H007', projectId:'P008', title:'Vytvoriť koncept prvej AI služby', assignee:'ChatGPT', output:'Ponuka, ICP, pricing hypotéza a pilot', deadline:'29. 10. 2026', status:'Nové', approval:'Tomáš schváli ponuku' },
  { id:'H008', projectId:'P011', title:'Navrhnúť osobný weekly review', assignee:'Gemini', output:'Jednostranová review šablóna', deadline:'22. 10. 2026', status:'Nové', approval:'Tomáš otestuje' },
  { id:'H009', projectId:'P016', title:'Pripraviť živú dátovú integráciu dashboardu', assignee:'Codex', output:'Obojsmerná synchronizácia rozhodnutí a projektov', deadline:'Po UX pilote', status:'Rozpracované', approval:'Tomáš schváli rozsah' },
  { id:'H010', projectId:'P016', title:'Importovať ChatGPT export a spraviť deduplikáciu', assignee:'ChatGPT', output:'820 konverzácií, 45 nápadov a 28 mechaník v riadiacom Sheete', status:'Hotové', approval:'Hotovo · čaká sa na Tomášovu revíziu' },
]

const events = [
  { date:'20. okt', time:'17:00', title:'AI Search Masterclass', type:'Webinár' },
  { date:'20. okt', time:'23:00', title:'Charlie Morgan – live session', type:'Online' },
  { date:'21. okt', time:'18:00', title:'AI agenti', type:'Webinár' },
  { date:'22. okt', time:'20:00', title:'Pitva mozgu', type:'Online' },
  { date:'1.–5. nov', time:'20:00', title:'Online Summit', type:'Summit' },
]

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id:'home', label:'Dnes', icon:LayoutDashboard },
  { id:'decisions', label:'Rozhodnutia', icon:ListChecks },
  { id:'projects', label:'Projekty', icon:FolderKanban },
  { id:'tasks', label:'Úlohy', icon:BellRing },
  { id:'agents', label:'Agent Control', icon:PlugZap },
  { id:'finance', label:'WOF Finance', icon:Banknote },
]

function ChiefOfStaffHQ() {
  const refreshLiveBriefing = useAction(api.liveBriefing.refresh)
  const [view, setView] = useState<View>('home')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions)
  const [editingDecision, setEditingDecision] = useState<string | null>(null)
  const [draftAnswers, setDraftAnswers] = useState<Record<string,string>>({})
  const [toast, setToast] = useState('')
  const [liveBriefing, setLiveBriefing] = useState<LiveBriefing | null>(null)
  const [briefingState, setBriefingState] = useState<BriefingState>('idle')
  const liveRefreshStarted = useRef(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('chief-decisions-v2')
    if (saved) {
      try { setDecisions(JSON.parse(saved) as Decision[]) } catch { /* keep snapshot */ }
    }
  }, [])

  const go = (next: View) => {
    setView(next); setMobileMenu(false)
    window.scrollTo({ top:0, behavior:'smooth' })
  }
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3600)
  }
  const updateDecision = (id: string, status: DecisionStatus, answer?: string) => {
    setDecisions(current => {
      const next = current.map(item => item.id === id ? { ...item, status, answer: answer ?? item.answer } : item)
      window.localStorage.setItem('chief-decisions-v2', JSON.stringify(next))
      return next
    })
    setEditingDecision(null)
    notify(status === 'Podklady vyžiadané' ? 'Požiadavka na podklady je uložená.' : 'Rozhodnutie je uložené v tomto zariadení.')
  }
  const handleRefreshBriefing = async () => {
    setBriefingState('loading')
    try {
      const result = await refreshLiveBriefing({})
      setLiveBriefing(result)
      setBriefingState('ready')
      window.sessionStorage.setItem('chief-live-briefing-v4', JSON.stringify(result))
      notify('Živé zdroje obnovené · '+result.calendar.length+' udalostí · '+result.emails.length+' mailov · '+result.agents.length+' agentov')
    } catch (error) {
      setBriefingState('error')
      notify(error instanceof Error ? error.message : 'Živé zdroje sa nepodarilo obnoviť.')
    }
  }
  useEffect(() => {
    if (liveRefreshStarted.current) return
    liveRefreshStarted.current = true

    const cached = window.sessionStorage.getItem('chief-live-briefing-v4')
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as LiveBriefing
        if (Date.now() - parsed.generatedAt < 10 * 60 * 1000) {
          setLiveBriefing(parsed)
          setBriefingState('ready')
          return
        }
      } catch { /* refresh live data */ }
    }

    void handleRefreshBriefing()
  }, [])

  const pending = decisions.filter(item => item.status === 'Čaká na Tomáša')
  const openTasks = liveBriefing
    ? liveBriefing.tasks.filter(item => item.status !== 'HOTOVO' && item.status !== 'ZRUŠENÉ').length
      + liveBriefing.workQueue.filter(item => item.status !== 'HOTOVO').length
    : aiTasks.filter(item => item.status !== 'Hotové').length

  return <div className="app-shell" data-testid="dashboard" data-state="ready">
    <aside className="sidebar-desktop">
      <Brand />
      <nav className="nav-stack" aria-label="Hlavná navigácia">
        {navItems.map(item => <NavButton key={item.id} item={item} active={view === item.id} count={item.id === 'decisions' ? pending.length : undefined} onClick={() => go(item.id)} />)}
      </nav>
      <div className="sidebar-footer">
        <div className="snapshot-note"><Sparkles size={14}/><div><strong>Pracovná verzia</strong><span>Dáta aktualizované · 22. 10. 2026</span></div></div>
        <div className="owner"><span>TK</span><div><strong>Tomáš</strong><small>Owner workspace</small></div></div>
        <SignOutButton />
      </div>
    </aside>

    <header className="mobile-header">
      <Brand compact />
      <button className="icon-button light" onClick={() => setMobileMenu(true)} aria-label="Otvoriť menu"><Menu size={20}/></button>
    </header>

    {mobileMenu && <div className="mobile-menu">
      <div className="mobile-menu-top"><Brand compact/><button className="icon-button dark" onClick={() => setMobileMenu(false)} aria-label="Zavrieť menu"><X size={20}/></button></div>
      <nav className="nav-stack">{navItems.map(item => <NavButton key={item.id} item={item} active={view === item.id} count={item.id === 'decisions' ? pending.length : undefined} onClick={() => go(item.id)} />)}</nav>
    </div>}

    <main className="main">
      <Topbar view={view}/>
      {view === 'home' && <HomeView pending={pending} openTasks={openTasks} go={go} openProject={setSelectedProject} live={liveBriefing} briefingState={briefingState} refreshBriefing={handleRefreshBriefing}/>}
      {view === 'decisions' && <DecisionsView decisions={decisions} editingDecision={editingDecision} setEditingDecision={setEditingDecision} drafts={draftAnswers} setDrafts={setDraftAnswers} update={updateDecision} goProject={project => { setSelectedProject(project) }}/>}
      {view === 'projects' && <ProjectsView openProject={setSelectedProject}/>}
      {view === 'tasks' && <TasksView live={liveBriefing} refreshBriefing={handleRefreshBriefing}/>}
      {view === 'agents' && <AgentsView live={liveBriefing} briefingState={briefingState} refreshBriefing={handleRefreshBriefing}/>}
      {view === 'finance' && <FinanceView/>}
      {view === 'more' && <MoreView go={go}/>} 
    </main>

    <nav className="bottom-nav" aria-label="Mobilná navigácia">
      {navItems.map(item => { const Icon=item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><Icon size={20}/><span>{item.id === 'home' ? 'Home' : item.id === 'decisions' ? 'Voľby' : item.label}</span>{item.id === 'decisions' && pending.length > 0 && <i>{pending.length}</i>}</button> })}
      <button className={view === 'more' ? 'active' : ''} onClick={() => go('more')}><MoreHorizontal size={20}/><span>Viac</span></button>
    </nav>

    {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)}/>}
    {toast && <div className="toast"><CircleCheckBig size={18}/><span>{toast}</span></div>}
  </div>
}

function Brand({ compact=false }: { compact?: boolean }) {
  return <div className="brand"><div className={compact ? 'wordmark compact' : 'wordmark'}>chief<span>.</span></div><div className="brand-sub">Command<br/>HQ</div></div>
}

function NavButton({ item, active, count, onClick }: { item:(typeof navItems)[number]; active:boolean; count?:number; onClick:()=>void }) {
  const Icon=item.icon
  return <button onClick={onClick} className={active ? 'nav-button active' : 'nav-button'}><Icon size={18}/><span>{item.label}</span>{count !== undefined && <b>{count}</b>}</button>
}

function Topbar({ view }: { view:View }) {
  const labels:Record<View,string>={ home:'Dnes', decisions:'Rozhodnutia', projects:'Portfólio projektov', tasks:'Úlohy a pripomienky', agents:'Agent Control', finance:'WOF Finance', more:'Viac' }
  return <div className="topbar"><div><p className="eyebrow">Chief of Staff HQ</p><h1>{labels[view]}</h1></div><div className="snapshot-pill"><span/>Živé riadiace centrum · 22. 10. 2026</div></div>
}

function HomeView({ pending, openTasks, go, openProject, live, briefingState, refreshBriefing }: { pending:Decision[]; openTasks:number; go:(view:View)=>void; openProject:(p:Project)=>void; live:LiveBriefing|null; briefingState:BriefingState; refreshBriefing:()=>Promise<void> }) {
  const submitCommand=useAction(api.commandCenter.submitCommand)
  const [commandText,setCommandText]=useState('')
  const [commandContext,setCommandContext]=useState<{type:string;id:string;label:string}|null>(null)
  const [selectedAgent,setSelectedAgent]=useState<(typeof directAssistants)[number]['id']>('NORA')
  const [commandState,setCommandState]=useState<'idle'|'saving'|'done'|'error'>('idle')
  const focus=projects.filter(p=>p.priority==='P0').slice(0,3)
  const liveEvents=live?.calendar.map(item=>{
    const start=new Date(item.start)
    return {
      date:start.toLocaleDateString('sk-SK',{day:'numeric',month:'short',timeZone:'Europe/Bratislava'}).replace('.',''),
      time:item.allDay?'Celý deň':start.toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bratislava'}),
      title:item.title, type:'Kalendár', url:item.url,
    }
  })
  const displayedEvents=live ? (liveEvents ?? []) : events.map(item=>({...item,url:''}))
  const personalTasks=(live?.tasks??[]).filter(task=>task.status!=='HOTOVO'&&task.status!=='ZRUŠENÉ').slice(0,5)
  const queueCommand=async()=>{
    if(!commandText.trim()) return
    setCommandState('saving')
    try {
      await submitCommand({command:commandText,contextType:commandContext?.type,contextId:commandContext?.id,channel:'Dashboard',agentId:selectedAgent})
      setCommandText('');setCommandContext(null);setCommandState('done')
      await refreshBriefing()
      window.setTimeout(()=>setCommandState('idle'),2600)
    } catch { setCommandState('error') }
  }
  const prepareEmailCommand=(email:LiveBriefing['emails'][number],kind:'draft'|'event'|'attachment')=>{
    setCommandContext({type:'Email',id:email.id,label:email.subject})
    setCommandText(kind==='draft'?'Priprav mi draft odpovede na tento e-mail.':kind==='event'?'Vytvor z tohto e-mailu udalosť v kalendári.':'Ulož prílohy z tohto e-mailu na Google Drive.')
    document.getElementById('command-center')?.scrollIntoView({behavior:'smooth',block:'center'})
  }
  return <div className="page today-page">
    <section className="hero today-hero">
      <div><p className="eyebrow">Štvrtok · 22. október 2026</p><h2>Dobré dopoludnie,<br/><span>Tomáš.</span></h2></div>
      <div className={'brief-status '+briefingState}><Sparkles size={16}/><div><strong>Denný briefing</strong><small>{briefingState==='ready'&&live?'Živé zdroje · obnovené '+new Date(live.generatedAt).toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'}):briefingState==='loading'?'Načítavam Gmail, Kalendár a Control Center…':briefingState==='error'?'Obnovenie zlyhalo · skús znova':'Gmail, Kalendár a Drive sú pripojené'}</small></div><button onClick={()=>void refreshBriefing()} disabled={briefingState==='loading'} aria-label="Obnoviť briefing"><RefreshCw className={briefingState==='loading'?'spin':''} size={16}/></button></div>
    </section>

    <section className="command-center panel" id="command-center">
      <div className="command-heading"><span><Command size={18}/></span><div><p className="eyebrow">Command Center</p><h3>Čo mám urobiť?</h3></div><small>Príkaz sa uloží do spoločnej fronty</small></div>
      {commandContext&&<div className="command-context"><Mail size={14}/><span>E-mail: <strong>{commandContext.label}</strong></span><button onClick={()=>setCommandContext(null)}><X size={13}/></button></div>}
      <div className="assistant-routing"><span>Adresát</span><div>{directAssistants.map(agent=><button key={agent.id} className={selectedAgent===agent.id?'active':''} onClick={()=>setSelectedAgent(agent.id)} title={agent.hint}><strong>{agent.id==='WOF_FIN'&&<img src={saraPortrait} alt="" width={26} height={26} style={{display:'inline-block',verticalAlign:'middle',marginRight:7,borderRadius:'50%',objectFit:'cover'}}/>}{agent.name}</strong><small>{agent.role}</small></button>)}</div></div>
      <div className="command-entry"><textarea value={commandText} onChange={e=>setCommandText(e.target.value)} placeholder="Napr. priprav draft odpovede, vytvor udalosť, ulož prílohu na Drive alebo pridaj pripomienku…"/><button className="button-primary" onClick={()=>void queueCommand()} disabled={!commandText.trim()||commandState==='saving'}>{commandState==='saving'?<RefreshCw className="spin" size={16}/>:<Send size={16}/>} Zaradiť príkaz</button></div>
      <div className="command-chips">
        {['Priprav mi dnešné priority','Pridaj úlohu a pripomienku','Skontroluj, čo čaká na moje rozhodnutie','Priprav ranný briefing'].map(text=><button key={text} onClick={()=>{setCommandContext(null);setCommandText(text)}}>{text}</button>)}
      </div>
      {commandState==='done'&&<p className="command-feedback success"><CircleCheckBig size={14}/> Príkaz je v Command Inboxe a bol pridelený: {directAssistants.find(agent=>agent.id===selectedAgent)?.name}.</p>}
      {commandState==='error'&&<p className="command-feedback error"><AlertCircle size={14}/> Príkaz sa nepodarilo uložiť. Skús obnoviť zdroje.</p>}
    </section>

    <section className="daily-focus" aria-label="Tri výsledky dňa">
      <div className="daily-focus-heading"><span><Target size={16}/></span><div><small>3 výsledky dňa</small><strong>Čo dnes skutočne posunie veci</strong></div></div>
      <div className="daily-focus-items three-items">
        <button onClick={() => go('decisions')}><b>01</b><span>Rozhodnúť hlavný vstup pre Chief of Staff</span><ArrowRight size={15}/></button>
        <button onClick={() => openProject(projects.find(project => project.id === 'P003')!)}><b>02</b><span>Určiť ďalší krok pre WOF Event Platform</span><ArrowRight size={15}/></button>
        <button onClick={() => go('tasks')}><b>03</b><span>Vyčistiť úlohy a pripomienky</span><ArrowRight size={15}/></button>
      </div>
    </section>

    <section className="metric-grid three compact-metrics">
      <MetricLink icon={FolderKanban} value={projects.length} label="Aktívne portfólio" note="Zjednotený register projektov" tone="dark" onClick={() => go('projects')}/>
      <MetricLink icon={AlertCircle} value={pending.length} label="Na rozhodnutie" note="Otvor rozhodovací rad" tone="lime" onClick={() => go('decisions')}/>
      <MetricLink icon={BellRing} value={openTasks} label="Otvorené úlohy" note="Osobné aj delegované úlohy" tone="pink" onClick={() => go('tasks')}/>
    </section>

    <div className="command-grid">
      <section className="panel mail-panel command-mail">
        <SectionTitle eyebrow="Inbox radar" title="Neprečítané maily na kontrolu" action={<span className="subtle-count">{live?Math.min(live.emails.length,12)+' z '+live.emails.length:'—'}</span>}/>
        <div className={'source-notice '+(live?'connected':'')}><Mail size={15}/><span><strong>Gmail: tomas.kocner@gmail.com.</strong> Neprečítané za posledných 7 dní, bez promo, sociálnych sietí a fór.</span></div>
        {live?<div className="mail-list">{live.emails.slice(0,12).map(email=><article className="mail-command-row" key={email.id}><a href={email.url} target="_blank" rel="noreferrer"><span className={email.important?'mail-mark important':'mail-mark'}><Mail size={14}/></span><div><strong>{email.subject}</strong><small>{email.sender}</small><p>{email.preview}</p></div><ArrowUpRight size={14}/></a><div className="mail-actions"><button onClick={()=>prepareEmailCommand(email,'draft')}>Draft odpovede</button><button onClick={()=>prepareEmailCommand(email,'event')}>Do kalendára</button><button onClick={()=>prepareEmailCommand(email,'attachment')}>Príloha → Drive</button></div></article>)}{live.emails.length===0&&<div className="connection-empty"><span><CircleCheckBig size={18}/></span><div><strong>Žiadne neprečítané maily</strong><p>Zdroj funguje; filter kontroluje posledných 7 dní.</p></div></div>}</div>:<div className="connection-empty"><span><Mail size={18}/></span><div><strong>Načítavam pripojený Gmail</strong><p>Inbox sa po prihlásení obnoví automaticky.</p></div></div>}
      </section>

      <div className="command-side">
        <section className="panel calendar-panel">
          <SectionTitle eyebrow="Kalendár" title="Najbližšie udalosti" action={<span className="subtle-count">{displayedEvents.length}</span>}/>
          <div className="events-grid compact-events">{displayedEvents.slice(0,10).map((event,index)=><a className="event-row" href={event.url||undefined} target={event.url?'_blank':undefined} rel={event.url?'noreferrer':undefined} key={event.title+index}><span className="event-date"><strong>{event.date.split(' ')[0]}</strong><small>{event.date.split(' ').slice(1).join(' ')}</small></span><span className="event-copy"><strong>{event.title}</strong><small>{event.time}</small></span></a>)}</div>
        </section>
        <section className="panel decisions-preview">
          <SectionTitle eyebrow="Na moje rozhodnutie" title="Najbližšie voľby" action={<button className="text-link" onClick={() => go('decisions')}>Všetky <ChevronRight size={14}/></button>}/>
          <div className="preview-list">{pending.slice(0,3).map((decision,index)=><button key={decision.id} className="decision-row" onClick={() => go('decisions')}><span className="row-index">0{index+1}</span><span className="row-copy"><strong>{decision.question}</strong><small>{projects.find(p=>p.id===decision.projectId)?.name} · do {decision.deadline}</small></span><ChevronRight size={16}/></button>)}</div>
        </section>
      </div>
    </div>

    <div className="insight-grid">
      <section className="panel">
        <SectionTitle eyebrow="Úlohy a pripomienky" title="Čo nesmie zapadnúť" action={<button className="text-link" onClick={()=>go('tasks')}>Všetky <ChevronRight size={14}/></button>}/>
        <div className="personal-task-preview">{personalTasks.map(task=><button key={task.id} onClick={()=>go('tasks')}><span className={'task-priority '+task.priority.toLocaleLowerCase('sk').replace('ô','o').replace('é','e')}>{task.priority}</span><div><strong>{task.title}</strong><small>{task.deadline?('do '+task.deadline):task.owner} · {task.status}</small></div><ChevronRight size={15}/></button>)}{personalTasks.length===0&&<div className="connection-empty"><span><CircleCheckBig size={18}/></span><div><strong>Žiadne otvorené osobné úlohy</strong><p>Novú úlohu môžeš pridať priamo cez kartu Úlohy.</p></div></div>}</div>
      </section>
      <section className="panel cos-actions">
        <SectionTitle eyebrow="Chief of Staff" title="Odporúčané ďalšie kroky"/>
        <button onClick={()=>go('decisions')}><CircleCheckBig size={17}/><span><strong>Vyčisti rozhodovací rad</strong><small>{pending.length} položiek čaká na tvoje rozhodnutie</small></span><ArrowRight size={15}/></button>
        <button onClick={()=>go('tasks')}><BellRing size={17}/><span><strong>Skontroluj úlohy</strong><small>{openTasks} otvorených osobných a AI úloh</small></span><ArrowRight size={15}/></button>
        <button onClick={()=>go('agents')}><PlugZap size={17}/><span><strong>Skontroluj agentov</strong><small>{live?.agents.filter(agent=>agent.status==='PRIPOJENÝ').length??0} pripojení · {live?.agents.filter(agent=>agent.status==='PLÁNOVANÉ').length??0} plánovaní</small></span><ArrowRight size={15}/></button>
      </section>
    </div>

    <section className="focus-section">
      <SectionTitle eyebrow="Priorita: Teraz" title="Projekty, ktoré potrebujú pozornosť" action={<button className="text-link" onClick={() => go('projects')}>Portfólio <ChevronRight size={14}/></button>}/>
      <div className="card-grid">{focus.map(project=><ProjectCard key={project.id} project={project} onClick={() => openProject(project)}/>)}</div>
    </section>
  </div>
}

function MetricLink({ icon:Icon, value, label, note, tone, onClick }: { icon:LucideIcon; value:number; label:string; note:string; tone:string; onClick:()=>void }) {
  return <button className={'metric-card '+tone} onClick={onClick}><span className="metric-icon"><Icon size={19}/></span><span className="metric-content"><strong>{value}</strong><b>{label}</b><small>{note}</small></span><ArrowUpRight className="metric-arrow" size={20}/></button>
}

function DecisionsView({ decisions, editingDecision, setEditingDecision, drafts, setDrafts, update, goProject }: {
  decisions:Decision[]; editingDecision:string|null; setEditingDecision:(id:string|null)=>void
  drafts:Record<string,string>; setDrafts:(next:Record<string,string>)=>void
  update:(id:string,status:DecisionStatus,answer?:string)=>void; goProject:(p:Project)=>void
}) {
  const [filter,setFilter]=useState('Čaká na Tomáša')
  const shown=decisions.filter(d=>filter==='Všetky'||d.status===filter)
  return <div className="page">
    <PageIntro eyebrow="Decision Queue" title="Rozhodnutie musí mať dostatok kontextu." text="Každá karta vysvetľuje, o čo ide, z čoho vznikla a na ktorú úlohu nadväzuje. Ak informácie nestačia, vráť ju AI na dopracovanie podkladov."/>
    <div className="filter-row">{['Čaká na Tomáša','Podklady vyžiadané','Vlastná odpoveď','Schválené','Odložené','Všetky'].map(item=><button key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}{item==='Čaká na Tomáša'&&<span>{decisions.filter(d=>d.status===item).length}</span>}</button>)}</div>
    <div className="decision-stack">{shown.map(decision=>{
      const project=projects.find(p=>p.id===decision.projectId)
      const task=aiTasks.find(t=>t.id===decision.relatedTask)
      const isEditing=editingDecision===decision.id
      return <article className="decision-card" key={decision.id}>
        <div className="decision-meta"><StatusBadge value={decision.status}/><span>{decision.id}</span><span className="deadline"><Clock3 size={13}/>do {decision.deadline}</span></div>
        <h3>{decision.question}</h3>
        <div className="context-box">
          <p className="detail-label">O čo ide</p>
          <p>{decision.context}</p>
          <div className="context-links">
            {project&&<button onClick={()=>goProject(project)}><FolderKanban size={14}/>{project.name}<ChevronRight size={13}/></button>}
            {task&&<span><Bot size={14}/>{task.id}: {task.title}</span>}
            <span><MessageSquareText size={14}/>{decision.source}</span>
          </div>
        </div>
        <div className="recommendation-box"><p className="detail-label">Odporúčanie Chief of Staff</p><strong>{decision.recommendation}</strong></div>
        <div className="decision-columns"><div><p className="detail-label">Prečo</p><p>{decision.reason}</p></div><div><p className="detail-label">Dopad</p><p>{decision.impact}</p></div></div>
        <div className="alternatives"><p className="detail-label">Alternatívy</p><div>{decision.alternatives.map(a=><span key={a}>{a}</span>)}</div></div>
        {decision.answer&&<div className="saved-answer"><p className="detail-label">Tvoja odpoveď</p><p>{decision.answer}</p></div>}
        {isEditing&&<div className="answer-editor"><label htmlFor={'answer-'+decision.id}>Moje rozhodnutie alebo poznámka</label><textarea id={'answer-'+decision.id} value={drafts[decision.id]??decision.answer??''} onChange={e=>setDrafts({...drafts,[decision.id]:e.target.value})} placeholder="Napíš vlastné riešenie, podmienku alebo doplňujúcu poznámku…"/><div><button className="button-primary" disabled={!(drafts[decision.id]??'').trim()} onClick={()=>update(decision.id,'Vlastná odpoveď',drafts[decision.id])}><Check size={15}/>Uložiť odpoveď</button><button className="button-secondary" onClick={()=>setEditingDecision(null)}>Zrušiť</button></div></div>}
        <div className="decision-actions">
          <button className="button-primary" onClick={()=>update(decision.id,'Schválené')}><Check size={16}/>Schváliť</button>
          <button className="button-secondary" onClick={()=>setEditingDecision(isEditing?null:decision.id)}><MessageSquareText size={15}/>Vlastná odpoveď</button>
          <button className="button-secondary attention" onClick={()=>update(decision.id,'Podklady vyžiadané')}><FileQuestion size={15}/>Potrebujem podklady</button>
          <button className="button-quiet" onClick={()=>update(decision.id,'Odložené')}><Pause size={15}/>Odložiť</button>
        </div>
      </article>
    })}{shown.length===0&&<EmptyState icon={CircleCheckBig} title="V tejto kategórii nič nie je" text="Po zmene stavu sa rozhodnutie zobrazí v príslušnom filtri."/>}</div>
  </div>
}

function FinanceView() {
  const listPayables = useAction(wofFinanceApi.listPayables)
  const addManualPayable = useAction(wofFinanceApi.addManualPayable)
  const markPayablePaidManually = useAction(wofFinanceApi.markPayablePaidManually)
  const listBankStatements = useAction(bankStatementsApi.listBankStatements)
  const proposePaymentMatches = useAction(bankStatementsApi.proposePaymentMatches)
  const confirmPaymentMatch = useAction(bankStatementsApi.confirmPaymentMatch)
  const rejectPaymentMatch = useAction(bankStatementsApi.rejectPaymentMatch)
  const listFinanceReviews = useAction(financeReviewsApi.listFinanceReviews)
  const resolveFinanceReview = useAction(financeReviewsApi.resolveFinanceReview)
  const getFinanceHealth = useAction(financeHealthApi.getFinanceHealth)
  const [rows,setRows] = useState<WofPayable[]>([])
  const [bankStatements,setBankStatements] = useState<BankStatementRecord[]>([])
  const [bankTransactions,setBankTransactions] = useState<BankTransactionRecord[]>([])
  const [bankLoading,setBankLoading] = useState(false)
  const [bankError,setBankError] = useState('')
  const [bankFeedback,setBankFeedback] = useState('')
  const [bankMatchRunning,setBankMatchRunning] = useState(false)
  const [bankMatchAction,setBankMatchAction] = useState('')
  const [financeReviews,setFinanceReviews] = useState<FinanceReview[]>([])
  const [financeHealth,setFinanceHealth] = useState<FinanceHealth|null>(null)
  const [intakeLoading,setIntakeLoading] = useState(false)
  const [intakeFeedback,setIntakeFeedback] = useState('')
  const [reviewSaving,setReviewSaving] = useState('')
  const [reviewDrafts,setReviewDrafts] = useState<Record<string,{deliveryDate:string;category:FinanceCategory;currency:string;note:string}>>({})
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [showForm,setShowForm] = useState(false)
  const [filter,setFilter] = useState('Otvorené')
  const [error,setError] = useState('')
  const [feedback,setFeedback] = useState('')
  const [supplier,setSupplier] = useState('')
  const [purpose,setPurpose] = useState('')
  const [dueDate,setDueDate] = useState('')
  const [invoiceDate,setInvoiceDate] = useState('')
  const [deliveryDate,setDeliveryDate] = useState('')
  const [invoiceNumber,setInvoiceNumber] = useState('')
  const [amount,setAmount] = useState('')
  const [currency,setCurrency] = useState('EUR')
  const [paymentMethod,setPaymentMethod] = useState('Bankový prevod')
  const [manualPaymentGroup,setManualPaymentGroup] = useState<WofPayableGroup|null>(null)
  const [manualPaymentDate,setManualPaymentDate] = useState(todayInputDate())
  const [manualPaymentAmount,setManualPaymentAmount] = useState('')
  const [manualPaymentReference,setManualPaymentReference] = useState('')
  const [manualPaymentNote,setManualPaymentNote] = useState('')

  const refresh = async (force=false) => {
    setLoading(true); setError('')
    try {
      const result = await listPayables({force})
      if (!result.ok) { setRows([]); setError(result.message); return }
      setRows(result.rows)
      if (result.code === 'STALE_CACHE') setError(result.message)
    } catch {
      setError('WOF register sa nepodarilo obnoviť. Skontroluj pripojenie a skús to neskôr.')
    } finally { setLoading(false) }
  }
  const refreshBankStatements = async () => {
    setBankLoading(true); setBankError('')
    try {
      const history = await listBankStatements({})
      setBankStatements(history.statements)
      setBankTransactions(history.transactions)
    } catch {
      setBankError('Výpisy sa nepodarilo načítať zo synchronizovaného registra.')
    } finally { setBankLoading(false) }
  }
  const refreshFinanceReviews = async () => {
    setIntakeLoading(true)
    try { setFinanceReviews(await listFinanceReviews({})) }
    catch { setIntakeFeedback('Review front SARY sa nepodarilo načítať.') }
    finally { setIntakeLoading(false) }
  }
  const refreshFinanceHealth = async () => {
    try {
      const result=await getFinanceHealth({})
      setFinanceHealth(result.allowed?result.health:null)
    } catch { setFinanceHealth(null) }
  }
  const resolveReview = async (item:FinanceReview) => {
    const draft=reviewDrafts[item.id]??{deliveryDate:item.extractedDeliveryDate||'',category:(item.extractedCategory as FinanceCategory)||'Doklady',currency:item.extractedCurrency||'',note:''}
    if (!draft.deliveryDate) { setIntakeFeedback('Pred uložením potvrď dátum dodania.'); return }
    if ((draft.category==='Doklady'||draft.category==='Vystavene_FA')&&!/^[A-Z]{3}$/.test(draft.currency)) { setIntakeFeedback('Pri faktúre potvrď trojpísmenovú menu, napríklad EUR.'); return }
    setReviewSaving(item.id); setIntakeFeedback('')
    try {
      const result=await resolveFinanceReview({id:item.id,deliveryDate:draft.deliveryDate,category:draft.category,currency:draft.currency||undefined,note:draft.note||undefined})
      setIntakeFeedback(result.message)
      if (result.ok) {
        setReviewDrafts(current=>{const next={...current};delete next[item.id];return next})
        await refreshFinanceReviews()
      }
    } catch { setIntakeFeedback('Rozhodnutie sa nepodarilo uložiť do review frontu.') }
    finally { setReviewSaving('') }
  }
  useEffect(() => { void refresh(); void refreshBankStatements(); void refreshFinanceReviews(); void refreshFinanceHealth() }, [])

  const payableGroups = groupPayables(rows)
  const openGroups = payableGroups.filter(group => !isPaid(group.primary))
  const overdue = openGroups.filter(group => daysOverdue(group.primary.dueDate) > 0)
  const pendingVerification = openGroups.filter(group => !group.primary.transactionId && parseMoney(group.primary.paidAmount||'0')<=0)
  const totals = openGroups.reduce<Record<string,number>>((acc,group) => {
    const row = group.primary
    const value = parseMoney(row.amount)
    const remaining=outstandingAmount(row)
    if (Number.isFinite(value)) acc[row.currency || 'EUR'] = (acc[row.currency || 'EUR'] ?? 0) + remaining
    return acc
  },{})
  const displayed = payableGroups.filter(group => {
    const row = group.primary
    if (filter === 'Všetky') return true
    if (filter === 'Uhradené') return isPaid(row)
    if (filter === 'Po splatnosti') return !isPaid(row) && daysOverdue(row.dueDate) > 0
    if (filter === 'Na kontrolu') return !isPaid(row) && (!row.paymentStatus || row.paymentStatus.toLocaleLowerCase('sk').includes('overen'))
    return !isPaid(row)
  })

  const save = async () => {
    const parsedAmount = parseMoney(amount)
    if (!supplier.trim() || !purpose.trim() || !dueDate || !deliveryDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    setSaving(true); setFeedback(''); setError('')
    try {
      const result = await addManualPayable({
        supplier:supplier.trim(), purpose:purpose.trim(), dueDate, amount:parsedAmount, currency,
        paymentMethod, invoiceDate:invoiceDate || undefined, deliveryDate, invoiceNumber:invoiceNumber.trim() || undefined,
      })
      if (!result.ok) { setFeedback(result.message); return }
      setFeedback(`${result.id} · ${result.message}`)
      setSupplier(''); setPurpose(''); setDueDate(''); setInvoiceDate(''); setDeliveryDate(''); setInvoiceNumber(''); setAmount(''); setCurrency('EUR')
      setShowForm(false)
      await refresh()
    } catch {
      setFeedback('Záväzok sa zatiaľ nepodarilo uložiť. Skontroluj pripojenie dashboardu k WOF registru.')
    } finally { setSaving(false) }
  }

  const runPaymentMatching = async () => {
    setBankMatchRunning(true); setBankFeedback(''); setBankError('')
    try {
      const result=await proposePaymentMatches({})
      if (!result.ok) { setBankError(result.message); return }
      setBankFeedback(result.message)
      await refreshBankStatements()
    } catch { setBankError('Návrhy párovania sa nepodarilo vytvoriť.') }
    finally { setBankMatchRunning(false) }
  }
  const decidePaymentMatch = async (transactionId:string,accept:boolean) => {
    setBankMatchAction(transactionId); setBankFeedback(''); setBankError('')
    try {
      const result=accept?await confirmPaymentMatch({transactionId}):await rejectPaymentMatch({transactionId})
      if (!result.ok) { setBankError(result.message); return }
      setBankFeedback(result.message)
      await Promise.all([refreshBankStatements(),refresh(true),refreshFinanceHealth()])
    } catch { setBankError('Rozhodnutie o párovaní sa nepodarilo uložiť.') }
    finally { setBankMatchAction('') }
  }

  const confirmManualPayment = async (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const paymentAmount=parseMoney(manualPaymentAmount)
    if (!manualPaymentGroup || !manualPaymentDate || !Number.isFinite(paymentAmount) || paymentAmount<=0) return
    setSaving(true); setFeedback(''); setError('')
    try {
      const result = await markPayablePaidManually({
        documentIds:manualPaymentGroup.documents.map(document=>document.id),
        paymentDate:manualPaymentDate,
        amount:paymentAmount,
        reference:manualPaymentReference.trim() || undefined,
        note:manualPaymentNote.trim() || undefined,
      })
      if (!result.ok) { setFeedback(result.message); return }
      setFeedback(result.message)
      setManualPaymentGroup(null); setManualPaymentReference(''); setManualPaymentNote('')
      await refresh()
    } catch {
      setFeedback('Ručnú úhradu sa nepodarilo zapísať. Obnov register a skontroluj, či záväzok nie je už uhradený.')
    } finally { setSaving(false) }
  }

  return <div className="page finance-page">
    <PageIntro eyebrow="SARA · WOF Finance" title="Čo treba uhradiť a čo už mešká." text="Otvorené záväzky sa načítajú z WOF registra. Platby kartou a paušály sa zobrazia ako uhradené; bankové prevody overíme podľa výpisu alebo dokladu."/>
    <div className="finance-actions">
      <span><Banknote size={15}/> Zdroj: WOF Finance Register · Doklady + Banka</span>
      <div>
        <a className="button-secondary" href="https://drive.google.com/drive/folders/1vkbIi3cQpyN-xkXG3-As2PCYwJaAz0uS" target="_blank" rel="noreferrer">Otvoriť archív WOF ↗</a>
        <button className="button-primary" onClick={()=>{setShowForm(v=>!v);setFeedback('')}}><Plus size={15}/>{showForm?'Zavrieť formulár':'Pridať záväzok'}</button>
        <button className="icon-button light" onClick={()=>void Promise.all([refresh(true),refreshFinanceHealth()])} disabled={loading} aria-label="Obnoviť WOF platby a stav SARY"><RefreshCw className={loading?'spin':''} size={16}/></button>
      </div>
    </div>
    {financeHealth&&<div className={'source-notice '+(financeHealth.ok?'connected':'finance-warning')}>
      {financeHealth.ok?<CircleCheckBig size={15}/>:<AlertCircle size={15}/>}<span>{financeHealth.ok
        ? `SARA finance je v poriadku · register ${financeHealth.register.payableCount} položiek · kontrola ${new Date(financeHealth.checkedAt).toLocaleString('sk-SK')}`
        : `SARA finance vyžaduje pozornosť: ${financeHealth.issues.map(issue=>FINANCE_HEALTH_LABELS[issue]||issue).join(' · ')}`}</span>
    </div>}
    {error&&<div className="source-notice finance-warning"><AlertCircle size={15}/><span>{error}</span></div>}
    {feedback&&<div className="source-notice connected"><CircleCheckBig size={15}/><span>{feedback}</span></div>}
    {showForm&&<form className="panel finance-form" onSubmit={e=>{e.preventDefault();void save()}}>
      <div className="finance-form-heading"><div><p className="eyebrow">Ručný zápis</p><h3>Pridať záväzok do registra</h3></div><span>Karta a paušál sa zobrazia ako uhradené hneď po zadaní.</span></div>
      <label>Dodávateľ<input value={supplier} onChange={e=>setSupplier(e.target.value)} maxLength={200} required placeholder="Názov dodávateľa"/></label>
      <label>Účel / poznámka<input value={purpose} onChange={e=>setPurpose(e.target.value)} maxLength={500} required placeholder="Za čo sa platí?"/></label>
      <label>Číslo faktúry<input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} maxLength={100} placeholder="Voliteľné"/></label>
      <label>Dátum vystavenia<input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>
      <label>Dátum dodania<input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} required/></label>
      <label>Splatnosť<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></label>
      <label>Suma<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required placeholder="0,00"/></label>
      <label>Mena<select value={currency} onChange={e=>setCurrency(e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option><option>CZK</option></select></label>
      <label>Spôsob úhrady<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option>Bankový prevod</option><option>Platobná karta</option><option>Trvalý príkaz / paušál</option><option>Hotovosť</option><option>Iné</option></select></label>
      <div className="finance-form-footer"><p>Účtovné obdobie určuje dátum dodania. Platbu kartou alebo paušálom predpokladáme ako uhradenú; bankový prevod ostáva neoverený do kontroly výpisu.</p><button className="button-primary" type="submit" disabled={saving||!supplier.trim()||!purpose.trim()||!deliveryDate||!dueDate||!amount}>{saving?<RefreshCw className="spin" size={15}/>:<Plus size={15}/>} Uložiť záväzok</button></div>
    </form>}
    <div className="finance-summary">
      <article className="finance-kpi dark"><small>Otvorené záväzky</small><strong>{Object.entries(totals).length?Object.entries(totals).map(([code,value])=>formatMoney(value,code)).join(' · '):'—'}</strong><span>{openGroups.length} jedinečných položiek · duplicitné doklady sa nepočítajú dvakrát</span></article>
      <article className="finance-kpi warning"><small>Po splatnosti</small><strong>{overdue.length}</strong><span>jedinečné položky s uplynutou splatnosťou</span></article>
      <article className="finance-kpi"><small>Čaká na overenie</small><strong>{pendingVerification.length}</strong><span>platba zatiaľ nemá bankovú transakciu</span></article>
    </div>
    {manualPaymentGroup&&<form className="panel finance-form" onSubmit={confirmManualPayment}>
      <div className="finance-form-heading"><div><p className="eyebrow">Ručné priradenie úhrady</p><h3>{manualPaymentGroup.primary.supplier} · zostáva {formatMoney(outstandingAmount(manualPaymentGroup.primary),manualPaymentGroup.primary.currency||'EUR')}</h3></div><button className="icon-button light" type="button" onClick={()=>setManualPaymentGroup(null)} aria-label="Zavrieť priradenie úhrady"><X size={16}/></button></div>
      <label>Dátum úhrady<input type="date" value={manualPaymentDate} onChange={e=>setManualPaymentDate(e.target.value)} required/></label>
      <label>Suma tejto úhrady<input inputMode="decimal" value={manualPaymentAmount} onChange={e=>setManualPaymentAmount(e.target.value)} required placeholder="0,00"/></label>
      <label>Referencia / variabilný symbol<input value={manualPaymentReference} onChange={e=>setManualPaymentReference(e.target.value)} maxLength={200} placeholder="Napr. VS, číslo transakcie"/></label>
      <label>Poznámka<input value={manualPaymentNote} onChange={e=>setManualPaymentNote(e.target.value)} maxLength={500} placeholder="Voliteľné: karta, hotovosť, vysvetlenie"/></label>
      <div className="finance-form-footer"><p>Suma sa pripočíta k doteraz uhradenému. Ak nepokryje celý zostatok, záväzok ostane čiastočne uhradený.</p><button className="button-primary" type="submit" disabled={saving||!manualPaymentDate||!manualPaymentAmount}>{saving?<RefreshCw className="spin" size={15}/>:<CircleCheckBig size={15}/>} Potvrdiť úhradu</button></div>
    </form>}
    <div className="finance-table-panel panel">
      <div className="section-title"><div><p className="eyebrow">Prehľad úhrad</p><h2>Faktúry a záväzky</h2></div><span className="subtle-count">{loading?'Načítavam…':displayed.length+' záznamov'}</span></div>
      <div className="filter-row">{['Otvorené','Po splatnosti','Na kontrolu','Uhradené','Všetky'].map(item=><button key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}</button>)}</div>
      {loading?<div className="connection-empty"><span><RefreshCw className="spin" size={18}/></span><div><strong>Načítavam WOF register</strong><p>Čítam stav dokladov a bankových úhrad.</p></div></div>
      :displayed.length===0?<EmptyState icon={CircleCheckBig} title={rows.length?'V tejto kategórii nič nie je':'Register zatiaľ nemá záväzky'} text={rows.length?'Zmena filtra zobrazí ďalšie položky.':'Pridaj záväzok alebo prijmi doklad cez SARA.'}/>
      :<div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Dodávateľ / doklad</th><th>Suma</th><th>Splatnosť</th><th>Stav</th><th>Spôsob</th><th>Zdroj</th><th>Akcia</th></tr></thead><tbody>{displayed.map(group=>{
        const row=group.primary
        const late=daysOverdue(row.dueDate)
        return <tr key={row.id} data-testid={'payable-'+row.id}>
          <td><strong>{row.supplier||'Bez dodávateľa'}</strong><small>{row.invoiceNumber||row.id} · {group.documents.map(document=>document.kind||'Doklad').join(' + ')}{group.documents.length>1?` · ${group.documents.length} doklady k jednej položke`:''}</small>{row.note&&<small className="finance-note">{row.note}</small>}</td>
          <td className="amount-cell">{formatMoney(parseMoney(row.amount),row.currency||'EUR')}{parseMoney(row.paidAmount||'0')>0&&<small>Uhradené {formatMoney(parseMoney(row.paidAmount||'0'),row.currency||'EUR')} · zostáva {formatMoney(outstandingAmount(row),row.currency||'EUR')}</small>}</td>
          <td>{row.dueDate?formatDate(row.dueDate):'—'}{late>0&&!isPaid(row)&&<small className="late-label">{late} dní po splatnosti</small>}</td>
          <td><span className={'payment-status '+(isPaid(row)?'paid':late>0?'late':'pending')}>{row.paymentStatus||'Neoverené'}</span>{row.transactionId&&<small>{row.transactionId.startsWith('Ručne')?'Ručne potvrdené · '+row.transactionId.replace(/^Ručne:\s*/, ''):'Transakcia spárovaná'}</small>}</td>
          <td>{row.paymentMethod||'—'}</td>
          <td>{group.documents.some(document=>document.fileUrl)?group.documents.filter(document=>document.fileUrl).map(document=><div key={document.id}><a href={document.fileUrl} target="_blank" rel="noreferrer">{document.kind||'Doklad'} ↗</a></div>):<span>Dashboard</span>}</td>
          <td>{!isPaid(row)&&<button className="button-secondary payment-action" onClick={()=>{setManualPaymentGroup(group);setManualPaymentDate(todayInputDate());setManualPaymentAmount(outstandingAmount(group.primary).toFixed(2));setManualPaymentReference('');setManualPaymentNote('')}}><CircleCheckBig size={14}/>Priradiť úhradu</button>}</td>
        </tr>
      })}</tbody></table></div>}
    </div>
    <div className="finance-footnote"><AlertCircle size={15}/><p><strong>Pravidlo úhrad:</strong> platby kartou a paušály sa automaticky zobrazia ako uhradené. Bankový prevod sa potvrdí po doklade o úhrade alebo po zhode s bankovým výpisom.</p></div>

    <section className="finance-table-panel panel bank-statements-panel email-intake-panel">
      <div className="section-title">
        <div><p className="eyebrow">SARA · Kontrola dokladov</p><h2>Review front</h2></div>
        <button className="icon-button light" type="button" onClick={()=>void refreshFinanceReviews()} disabled={intakeLoading} aria-label="Obnoviť review front"><RefreshCw className={intakeLoading?'spin':''} size={16}/></button>
      </div>
      <p className="bank-statement-help">Gmail, Drive a Telegram spracúva n8n. Nejednoznačný dokument zostane v pôvodnom Drive priečinku. Tu potvrdíš skutočný dátum dodania, cieľ a menu; n8n potom presunie existujúci súbor a aktualizuje rovnaký register riadok bez vytvorenia kópie.</p>
      {intakeFeedback&&<div aria-live="polite" role="status" className={'source-notice '+(intakeFeedback.includes('zlyhala')||intakeFeedback.includes('nepodarilo')?'finance-warning':'connected')}><Mail size={15}/><span>{intakeFeedback}</span></div>}
      {intakeLoading&&!financeReviews.length&&<p className="bank-empty-note">Načítavam review front…</p>}
      {!intakeLoading&&!financeReviews.filter(item=>item.status!=='RESOLVED').length&&<p className="bank-empty-note">Žiadny doklad nečaká na rozhodnutie.</p>}
      {!!financeReviews.filter(item=>item.status!=='RESOLVED').length&&<div className="email-intake-review"><strong>Dokumenty čakajúce na zaradenie</strong><p>SARA ich neuloží do nesprávneho mesiaca. Otvor originál a potvrď iba údaje, ktoré sú na doklade.</p>{financeReviews.filter(item=>item.status!=='RESOLVED').map(item=>{
        const draft=reviewDrafts[item.id]??{deliveryDate:item.extractedDeliveryDate||'',category:(item.extractedCategory as FinanceCategory)||'Doklady',currency:item.extractedCurrency||'',note:''}
        return <div className="email-intake-review-row" key={item.id}>
          <div><strong><a href={item.fileUrl} target="_blank" rel="noreferrer">{item.sourceFileName} ↗</a></strong><small>{item.supplier||'Neurčený partner'} · {item.invoiceNumber||item.documentId}</small><small className="review-reason">{item.completionError||item.reviewReason}</small></div>
          <label>Dátum dodania<input type="date" value={draft.deliveryDate} onChange={event=>setReviewDrafts(current=>({...current,[item.id]:{...draft,deliveryDate:event.target.value}}))}/></label>
          <label>Priečinok<select value={draft.category} onChange={event=>setReviewDrafts(current=>({...current,[item.id]:{...draft,category:event.target.value as FinanceCategory}}))}><option value="Doklady">Doklady</option><option value="Stripe">Stripe</option><option value="Vypisy">Vypisy</option><option value="Vystavene_FA">Vystavene_FA</option></select></label>
          <label>Mena<input value={draft.currency} maxLength={3} placeholder="EUR" onChange={event=>setReviewDrafts(current=>({...current,[item.id]:{...draft,currency:event.target.value.toUpperCase().replace(/[^A-Z]/g,'')}}))}/></label>
          <button className="button-primary" type="button" disabled={!draft.deliveryDate||reviewSaving===item.id||item.status==='READY'} onClick={()=>void resolveReview(item)}>{reviewSaving===item.id?<RefreshCw className="spin" size={14}/>:<Check size={14}/>} {item.status==='READY'?'Čaká na n8n':reviewSaving===item.id?'Ukladám…':'Potvrdiť'}</button>
        </div>
      })}</div>}
    </section>
    <section className="finance-table-panel panel bank-statements-panel">
      <div className="section-title">
        <div><p className="eyebrow">SARA · Banka</p><h2>Bankové výpisy</h2></div>
        <div className="bank-statement-actions">
          <a className="button-secondary" href="https://drive.google.com/drive/folders/1vkbIi3cQpyN-xkXG3-As2PCYwJaAz0uS" target="_blank" rel="noreferrer">Otvoriť archív WOF ↗</a>
          <button className="button-secondary" type="button" onClick={()=>void runPaymentMatching()} disabled={bankMatchRunning||bankLoading}>{bankMatchRunning?<RefreshCw className="spin" size={14}/>:<Link2 size={14}/>} {bankMatchRunning?'Porovnávam…':'Navrhnúť párovanie'}</button>
          <button className="icon-button light" type="button" onClick={()=>void refreshBankStatements()} disabled={bankLoading} aria-label="Obnoviť bankové výpisy"><RefreshCw className={bankLoading?'spin':''} size={16}/></button>
        </div>
      </div>
      <p className="bank-statement-help">Ulož CSV aj PDF s rovnakým názvom do mesačného priečinka Vypisy. Sara importuje CSV; PDF zostane pri ňom pre účtovníčku. Import rozlišuje účet a preskočí už načítané transakcie.</p>
      {bankError&&<div className="source-notice finance-warning"><AlertCircle size={15}/><span>{bankError}</span></div>}
      {bankFeedback&&<div className="source-notice connected"><CircleCheckBig size={15}/><span>{bankFeedback}</span></div>}
      <div className="bank-import-row">
        <span>CSV a PDF s rovnakým názvom kontroluje n8n v mesačných priečinkoch Vypisy. Účet sa ukladá iba v maskovanej podobe a opakovaný CSV import nevytvorí druhé transakcie.</span>
      </div>
      <div className="bank-subsection-title"><div><p className="eyebrow">História importov</p><strong>Výpisy a kontrola duplicít</strong></div><span>{bankStatements.length} importov</span></div>
      {bankStatements.length===0
        ? <p className="bank-empty-note">Po prvom importe sa tu zobrazí obdobie, účet, počty transakcií a stav párovania.</p>
        : <div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Obdobie / účet</th><th>Zostatok</th><th>Príjmy</th><th>Výdavky</th><th>Nové transakcie</th><th>Zdroj</th></tr></thead><tbody>{bankStatements.map(statement=><tr key={statement.id}>
          <td><strong>{statement.periodStart.slice(0,7)} · {statement.accountLabel}</strong><small>{statement.accountNumberMasked} · výpis {statement.statementNumber||'—'}</small></td>
          <td>{formatMoney(statement.closingBalance,statement.currency)}</td>
          <td>{formatMoney(statement.incomeTotal,statement.currency)}</td>
          <td>{formatMoney(statement.expenseTotal,statement.currency)}</td>
          <td>{statement.transactionCount}<small>{statement.duplicateCount?statement.duplicateCount+' duplicít preskočených':'bez opakovaných transakcií'}</small></td>
          <td><a href={statement.sourceFileUrl} target="_blank" rel="noreferrer">CSV ↗</a>{statement.pdfFileName&&<small>{statement.pdfFileName}</small>}</td>
        </tr>)}</tbody></table></div>}
      <div className="bank-subsection-title"><div><p className="eyebrow">Transakcie</p><strong>Posledné načítané pohyby</strong></div><span>{bankTransactions.length} položiek</span></div>
      {bankTransactions.length===0
        ? <p className="bank-empty-note">Transakcie sa zobrazia po importe CSV. Sara pripraví iba jednoznačné návrhy; úhrada sa do registra zapíše až po tvojom potvrdení.</p>
        : <div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Dátum / účet</th><th>Protiúčet</th><th>Správa / symboly</th><th>Suma</th><th>Stav / párovanie</th></tr></thead><tbody>{bankTransactions.slice(0,100).map(tx=>{
          const owner=bankStatements.find(statement=>statement.id===tx.statementId)
          const proposedPayable=rows.find(row=>row.id===tx.matchedPayableId)
          return <tr key={tx.id}>
            <td>{formatDate(tx.bookedOn)}<small>{owner?.accountLabel||tx.accountKey}</small></td>
            <td><strong>{tx.counterpartyName||'Neznámy príjemca'}</strong><small>{tx.counterpartyAccount}</small></td>
            <td><span>{tx.recipientMessage||tx.note||tx.transactionType||'—'}</span><small>{tx.variableSymbol?'VS '+tx.variableSymbol:''}{tx.constantSymbol?' · KS '+tx.constantSymbol:''}</small></td>
            <td className={'amount-cell '+(tx.amount<0?'bank-outgoing':'bank-incoming')}>{formatMoney(tx.amount,tx.currency)}</td>
            <td><span className={'payment-status '+(tx.matchStatus==='POTVRDENÁ'?'paid':tx.matchStatus==='NAVRHNUTÁ'?'pending':'')}>{tx.matchStatus}</span>{proposedPayable&&<div className="bank-match-proposal"><strong>{proposedPayable.supplier}</strong><small>{proposedPayable.invoiceNumber||proposedPayable.id} · {formatMoney(parseMoney(proposedPayable.amount),proposedPayable.currency)}</small>{tx.matchReason&&<small>{tx.matchReason}</small>}{tx.matchStatus==='NAVRHNUTÁ'&&<div><button className="button-primary" type="button" disabled={bankMatchAction===tx.id} onClick={()=>void decidePaymentMatch(tx.id,true)}><Check size={13}/>Potvrdiť</button><button className="button-quiet" type="button" disabled={bankMatchAction===tx.id} onClick={()=>void decidePaymentMatch(tx.id,false)}><X size={13}/>Zamietnuť</button></div>}</div>}</td>
          </tr>
        })}</tbody></table></div>}
    </section>
  </div>
}

function todayInputDate(): string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const values=parts.reduce<Record<string,string>>((acc,item)=>{if(item.type!=='literal')acc[item.type]=item.value;return acc},{})
  return `${values.year}-${values.month}-${values.day}`
}
function parseMoney(value:string): number {
  const compact=value.replace(/\s/g,'')
  const normalized=compact.includes(',')&&compact.includes('.')?compact.replace(/\./g,'').replace(',','.'):compact.replace(',','.')
  const parsed=Number(normalized)
  return Number.isFinite(parsed)?parsed:NaN
}
function outstandingAmount(row:WofPayable): number {
  return Math.max(0,parseMoney(row.amount)-parseMoney(row.paidAmount||'0'))
}
function isPaid(row:WofPayable): boolean {
  const status=row.paymentStatus.toLocaleLowerCase('sk').trim()
  return status==='uhradené'||status==='uhradene'||status==='paid'||status==='zaplatené'||status==='zaplatene'
}
function daysOverdue(value:string): number {
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!match) return 0
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const current=parts.reduce<Record<string,string>>((acc,item)=>{if(item.type!=='literal')acc[item.type]=item.value;return acc},{})
  const today=Date.UTC(Number(current.year),Number(current.month)-1,Number(current.day))
  const due=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))
  return Math.max(0,Math.floor((today-due)/86400000))
}
function groupPayables(rows:WofPayable[]): WofPayableGroup[] {
  const groups=new Map<string,WofPayable[]>()
  for(const row of rows) {
    const amount=parseMoney(row.amount)
    const hasStableIdentity=Boolean(row.supplier&&row.invoiceNumber&&row.currency&&Number.isFinite(amount))
    const key=hasStableIdentity
      ? [row.supplier.toLocaleLowerCase('sk').replace(/\s+/g,' '),row.invoiceNumber.toLocaleLowerCase('sk').trim(),amount.toFixed(2),row.currency.toUpperCase()].join('|')
      : row.id
    groups.set(key,[...(groups.get(key)??[]),row])
  }
  return [...groups.values()].map(documents=>({
    primary:documents.find(isPaid)??documents.find(document=>document.transactionId)??documents[0],
    documents,
  }))
}
function formatDate(value:string): string {
  const date=new Date(value+'T12:00:00')
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString('sk-SK',{day:'numeric',month:'short',year:'numeric'})
}
function formatMoney(value:number,currency:string): string {
  if(!Number.isFinite(value)) return '—'
  try{return new Intl.NumberFormat('sk-SK',{style:'currency',currency}).format(value)}catch{return value.toFixed(2)+' '+currency}
}

function ProjectsView({ openProject }: { openProject:(p:Project)=>void }) {
  const [query,setQuery]=useState('')
  const [priority,setPriority]=useState('Všetky priority')
  const [status,setStatus]=useState('Všetky stavy')
  const [area,setArea]=useState('Všetky oblasti')
  const areas=['Všetky oblasti',...Array.from(new Set(projects.map(p=>p.area)))]
  const filtered=useMemo(()=>projects.filter(project=>{
    const matchesQuery=(project.name+' '+project.area).toLowerCase().includes(query.toLowerCase())
    const matchesPriority=priority==='Všetky priority'||priorityMeta[project.priority].label===priority
    const matchesStatus=status==='Všetky stavy'||project.status===status
    const matchesArea=area==='Všetky oblasti'||project.area===area
    return matchesQuery&&matchesPriority&&matchesStatus&&matchesArea
  }),[query,priority,status,area])
  return <div className="page">
    <PageIntro eyebrow="Master Project Register" title="Všetko otvorené na jednom mieste." text="Priorita hovorí, kedy projekt potrebuje tvoju pozornosť. Stav hovorí, či sa na ňom pracuje, plánuje sa alebo na niečo čaká."/>
    <div className="priority-legend">{(Object.keys(priorityMeta) as Priority[]).map(key=><div key={key}><PriorityBadge value={key}/><span>{priorityMeta[key].description}</span></div>)}</div>
    <div className="project-toolbar">
      <label className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Hľadať projekt alebo oblasť…"/></label>
      <select value={priority} onChange={e=>setPriority(e.target.value)}><option>Všetky priority</option><option>Teraz</option><option>Dôležité</option><option>Neskôr</option></select>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>Všetky stavy</option><option>Aktívny</option><option>Plánovaný</option><option>Čaká</option><option>Pozastavený</option></select>
      <select value={area} onChange={e=>setArea(e.target.value)}>{areas.map(item=><option key={item}>{item}</option>)}</select>
    </div>
    <div className="result-meta"><span>{filtered.length} z {projects.length} projektov</span><span><SlidersHorizontal size={13}/>Filtre priority, stavu a oblasti</span></div>
    <div className="projects-grid">{filtered.map(project=><ProjectCard key={project.id} project={project} onClick={()=>openProject(project)}/>)}</div>
    {filtered.length===0&&<EmptyState icon={Search} title="Nič sme nenašli" text="Skús zmeniť hľadaný výraz alebo filter."/>}
  </div>
}

function ProjectCard({ project,onClick }: { project:Project; onClick:()=>void }) {
  return <button className="project-card" onClick={onClick}><div className="project-top"><div><PriorityBadge value={project.priority}/><span className="area">{project.area}</span></div><ArrowUpRight size={17}/></div><h3>{project.name}</h3><p>{project.nextAction}</p><div className="progress-meta"><span>Progress</span><b>{project.progress}%</b></div><div className="progress"><span style={{width:project.progress+'%'}}/></div><div className="project-bottom"><StatusBadge value={project.status}/><span>{project.horizon}</span></div></button>
}

function StaticTasksView() {
  const [filter,setFilter]=useState('Otvorené')
  const shown=aiTasks.filter(task=>filter==='Všetky'||(filter==='Otvorené'?task.status!=='Hotové':task.status===filter))
  return <div className="page">
    <PageIntro eyebrow="AI Handoff Inbox" title="Práca delegovaná. Kontrola zostáva u teba." text="Úlohy rozdelené medzi ChatGPT, Claude, Codex a Gemini s jasným výstupom, stavom a bodom schválenia."/>
    <div className="filter-row">{['Otvorené','Nové','Rozpracované','Čaká','Hotové','Všetky'].map(item=><button key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}</button>)}</div>
    <div className="task-grid">{shown.map(task=>{const project=projects.find(p=>p.id===task.projectId);return <article className="task-card" key={task.id}><div className="task-top"><span className="agent-avatar"><Bot size={17}/></span><StatusBadge value={task.status}/></div><p className="task-id">{task.id} · {task.assignee}</p><h3>{task.title}</h3><div className="task-output"><p className="detail-label">Výstup</p><p>{task.output}</p></div><dl><div><dt>Projekt</dt><dd>{project?.name}</dd></div><div><dt>Deadline</dt><dd>{task.deadline??'—'}</dd></div><div><dt>Schválenie</dt><dd>{task.approval}</dd></div></dl></article>})}</div>
  </div>
}

function TasksView({ live, refreshBriefing }: { live:LiveBriefing|null; refreshBriefing:()=>Promise<void> }) {
  const createTask=useAction(api.commandCenter.createTask)
  const decideAgentTask=useAction(api.commandCenter.decideAgentTask)
  const approvalBackendReady=true
  const [decidingId,setDecidingId]=useState<string|null>(null)
  const [approvalFeedback,setApprovalFeedback]=useState('')
  const [mode,setMode]=useState<'personal'|'agents'>('personal')
  const [filter,setFilter]=useState('Otvorené')
  const [title,setTitle]=useState('')
  const [priority,setPriority]=useState('DÔLEŽITÉ')
  const [deadline,setDeadline]=useState('')
  const [saving,setSaving]=useState(false)
  const [feedback,setFeedback]=useState('')
  const personal=live?.tasks??[]
  const queue=live?.workQueue??[]
  const shownPersonal=personal.filter(task=>filter==='Všetky'||(filter==='Hotovo'?task.status==='HOTOVO':task.status!=='HOTOVO'&&task.status!=='ZRUŠENÉ'))
  const shownQueue=queue.filter(task=>{
    if(filter==='Všetky') return true
    if(filter==='Otvorené') return task.status!=='HOTOVO'
    if(filter==='Čaká') return task.status.startsWith('ČAKÁ')||task.status==='BLOKOVANÉ'||task.status==='STALE'
    if(filter==='Hotovo') return task.status==='HOTOVO'
    return task.status==='ROZPRACOVANÉ'
  })
  const addTask=async()=>{
    if(!title.trim()) return
    setSaving(true);setFeedback('')
    try {
      const result=await createTask({title,priority,deadline:deadline||undefined})
      setTitle('');setDeadline('');setFeedback(result.id+' bolo pridané.')
      await refreshBriefing()
    } catch { setFeedback('Úlohu sa nepodarilo uložiť.') }
    finally { setSaving(false) }
  }
  const decideTask=async(taskId:string,decision:'approve'|'postpone')=>{
    setDecidingId(taskId);setApprovalFeedback('')
    try {
      const result=await decideAgentTask({taskId,decision})
      setApprovalFeedback(result.message)
      if(result.ok) await refreshBriefing()
    } catch {
      setApprovalFeedback('Zmena stavu sa nepodarila. Obnov prehľad a skontroluj úlohu.')
    } finally {
      setDecidingId(null)
    }
  }
  return <div className="page">
    <PageIntro eyebrow="Execution Center" title="Jedno miesto pre tvoje úlohy aj delegovanú AI prácu." text="Osobné úlohy, pripomienky a agent work queue používajú spoločný zdroj pravdy. Správa z dashboardu, Telegramu alebo e-mailu sa neskôr zapíše do rovnakej štruktúry."/>
    {approvalFeedback&&<div className="source-notice" role="status" data-testid="approval-feedback"><CircleCheckBig size={15}/><span>{approvalFeedback}</span></div>}
    {mode==='agents'&&!approvalBackendReady&&<div className="source-notice"><Clock3 size={15}/><span>Schvaľovanie je pripravené v náhľade. Aktivácia serverovej časti ešte čaká na nasadenie.</span></div>}
    <div className="task-mode-switch"><button className={mode==='personal'?'active':''} onClick={()=>setMode('personal')}><BellRing size={15}/> Moje úlohy <span>{personal.filter(t=>t.status!=='HOTOVO').length}</span></button><button className={mode==='agents'?'active':''} onClick={()=>setMode('agents')}><Bot size={15}/> AI Work Queue <span>{queue.filter(t=>t.status!=='HOTOVO').length}</span></button></div>
    {mode==='personal'&&<section className="panel quick-task-form"><div><p className="eyebrow">Quick capture</p><h3>Pridať úlohu alebo pripomienku</h3></div><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Čo treba urobiť?"/><select value={priority} onChange={e=>setPriority(e.target.value)}><option>TERAZ</option><option>DÔLEŽITÉ</option><option>NESKÔR</option></select><input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/><button className="button-primary" onClick={()=>void addTask()} disabled={!title.trim()||saving}>{saving?<RefreshCw className="spin" size={15}/>:<Plus size={15}/>} Pridať</button>{feedback&&<small>{feedback}</small>}</section>}
    <div className="filter-row">{['Otvorené','Rozpracované','Čaká','Hotovo','Všetky'].map(item=><button key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}</button>)}</div>
    {mode==='personal'?<div className="task-grid">{shownPersonal.map(task=><article className="task-card personal-task-card" key={task.id}><div className="task-top"><span className="agent-avatar"><BellRing size={17}/></span><StatusBadge value={task.status}/></div><p className="task-id">{task.id} · {task.source} · {task.priority}</p><h3>{task.title}</h3>{task.details&&<div className="task-output"><p className="detail-label">Detaily</p><p>{task.details}</p></div>}<dl><div><dt>Owner</dt><dd>{task.owner}</dd></div><div><dt>Deadline</dt><dd>{task.deadline||'—'}</dd></div><div><dt>Pripomienka</dt><dd>{task.reminder||'—'}</dd></div><div><dt>Projekt</dt><dd>{task.projectId||'—'}</dd></div></dl></article>)}</div>:<><div className="task-grid">{shownQueue.map(task=>{const project=projects.find(p=>p.id===task.projectId);return <article className="task-card" key={task.id}><div className="task-top"><span className="agent-avatar"><Bot size={17}/></span><StatusBadge value={task.status}/></div><p className="task-id">{task.id} · {task.owner} · {task.priority}</p><h3>{task.title}</h3><div className="task-output"><p className="detail-label">Očakávaný výstup</p><p>{task.expectedOutput||'—'}</p></div>{task.error&&<div className="task-error"><AlertCircle size={14}/>{task.error}</div>}<dl><div><dt>Projekt</dt><dd>{project?.name??task.projectId}</dd></div><div><dt>Aktualizované</dt><dd>{task.updated||'—'}</dd></div><div><dt>Ďalší agent</dt><dd>{task.nextAgent||'—'}</dd></div><div><dt>Schválenie</dt><dd>{task.approval||'Nie'}</dd></div></dl>{task.status==='ČAKÁ NA SCHVÁLENIE'&&<div className="decision-actions" data-testid={'approval-'+task.id}><button className="button-primary" disabled={!approvalBackendReady||decidingId===task.id} onClick={()=>void decideTask(task.id,'approve')}><Check size={15}/>{decidingId===task.id?'Ukladám…':'Schváliť zadanie'}</button><button className="button-secondary" disabled={!approvalBackendReady||decidingId===task.id} onClick={()=>void decideTask(task.id,'postpone')}><Pause size={15}/>Odložiť</button></div>}</article>})}</div>{queue.length===0&&<StaticTasksView/>}</>}
  </div>
}

function AgentsView({ live, briefingState, refreshBriefing }: { live:LiveBriefing|null; briefingState:BriefingState; refreshBriefing:()=>Promise<void> }) {
  const agents=live?.agents??[]
  const connected=agents.filter(agent=>agent.status==='PRIPOJENÝ').length
  const manual=agents.filter(agent=>agent.status==='MANUÁLNY HANDOFF').length
  const planned=agents.filter(agent=>agent.status==='PLÁNOVANÉ').length
  const blocked=(live?.workQueue??[]).filter(task=>task.status==='BLOKOVANÉ'||task.status==='STALE'||task.status.startsWith('ČAKÁ')).length
  return <div className="page">
    <PageIntro eyebrow="Agent Control Plane" title="Kto je pripojený, kto pracuje a kde sa práca zastavila." text="Stavy sa načítavajú zo spoločného registra. PRIPOJENÝ znamená reálne fungujúce napojenie; MANUÁLNY HANDOFF znamená, že výsledok sa ešte prenáša ručne."/>
    <div className="agent-metrics">
      <div><strong>{connected}</strong><span>pripojení</span></div>
      <div><strong>{manual}</strong><span>manuálny handoff</span></div>
      <div><strong>{planned}</strong><span>čaká na napojenie</span></div>
      <div><strong>{blocked}</strong><span>čakajúce alebo blokované úlohy</span></div>
    </div>
    <div className={'source-notice '+(agents.length?'connected':'')}><PlugZap size={15}/><span><strong>Agent Registry je živý.</strong> Zdroj: Google Sheet · kontrola {live?new Date(live.generatedAt).toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'}):'—'}.</span><button className="text-link" onClick={()=>void refreshBriefing()} disabled={briefingState==='loading'}>{briefingState==='loading'?'Načítavam…':'Obnoviť'}</button></div>
    <section className="routing-model"><div><p className="eyebrow">Komunikačný model</p><h3>Jedna centrála, priame odborné kontakty.</h3><p>NORA vidí stav celého systému. Každá špecialistka vidí iba svoju oblasť a zapisuje výsledok do spoločného registra.</p></div><div className="routing-lanes"><span><strong>NORA</strong><small>všeobecné a komplexné zadania</small></span><span><strong>SARA · WOF Finance</strong><small>Telegram kontakt pripravujeme</small></span><span><strong>Firma 2 Finance</strong><small>samostatný Telegram kontakt</small></span><span><strong>Ostatní špecialisti</strong><small>zatiaľ priamo z dashboardu alebo cez NORA</small></span></div></section>
    {live?.sourceErrors.length?<div className="source-errors">{live.sourceErrors.map(error=><div key={error}><AlertCircle size={15}/><span>{error}</span></div>)}</div>:null}
    <div className="agents-grid">{agents.map(agent=><article className="agent-card" key={agent.id}>
      <div className="agent-card-top"><AssistantAvatar id={agent.id}/><StatusBadge value={agent.status}/></div>
      <p className="task-id">{agent.id} · kontrola {agent.lastCheck}</p>
      <h3>{agent.id==='WOF_FIN'?'SARA · WOF Finance':agent.name}</h3><p>{agent.role}</p>{agent.id==='WOF_FIN'&&<div className="context-links"><a href="https://docs.google.com/spreadsheets/d/1KOEhMOA6IgjS71w6DC5YCPzMNdWj4lX6Kkbor22cxm8/edit" target="_blank" rel="noreferrer">Register dokladov ↗</a><a href="https://drive.google.com/drive/folders/1vkbIi3cQpyN-xkXG3-As2PCYwJaAz0uS" target="_blank" rel="noreferrer">Archív WOF ↗</a></div>}
      <dl><div><dt>Napojenie</dt><dd>{agent.connection}</dd></div><div><dt>Aktuálna úloha</dt><dd>{agent.currentTask||'—'}</dd></div><div><dt>Ďalší krok</dt><dd>{agent.nextStep}</dd></div></dl>
    </article>)}</div>
    {agents.length===0&&<EmptyState icon={PlugZap} title="Agent register sa načítava" text="Použi Obnoviť. Pri výpadku Drive zostanú Gmail a Kalendár funkčné samostatne."/>}
  </div>
}

function MoreView({ go }: { go:(v:View)=>void }) {
  return <div className="page"><PageIntro eyebrow="Rýchly prístup" title="Celý systém v jednom rozhraní." text="Ďalšie moduly budeme pridávať podľa toho, čo sa ukáže ako užitočné pri každodennom používaní."/><div className="more-grid">{navItems.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>go(item.id)}><span className="agent-avatar"><Icon size={18}/></span><div><strong>{item.label}</strong><small>Otvoriť modul</small></div><ChevronRight size={17}/></button>})}<div className="disabled"><span className="agent-avatar"><Inbox size={18}/></span><div><strong>Universal Inbox</strong><small>Pripravujeme</small></div></div><div className="disabled"><span className="agent-avatar"><Target size={18}/></span><div><strong>Ciele & RPM</strong><small>Pripravujeme</small></div></div></div></div>
}

function PriorityBadge({ value }: { value:Priority }) { return <span className={'badge priority '+value.toLowerCase()}>{priorityMeta[value].label}</span> }
function StatusBadge({ value }: { value:string }) { return <span className={'badge status '+value.toLowerCase().replaceAll(' ','-').replaceAll('á','a').replaceAll('é','e').replaceAll('ý','y')}>{value}</span> }

function ProjectModal({ project,onClose }: { project:Project; onClose:()=>void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="project-modal" onMouseDown={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={onClose} aria-label="Zavrieť"><X size={18}/></button><div className="modal-heading"><div><PriorityBadge value={project.priority}/><StatusBadge value={project.status}/><span>{project.id} · {project.area}</span></div><h2>{project.name}</h2></div><div className="modal-details"><div><p className="detail-label">Owner</p><strong>{project.owner}</strong></div><div><p className="detail-label">Horizont</p><strong>{project.horizon}</strong></div>{project.deadline&&<div><p className="detail-label">Deadline</p><strong>{project.deadline}</strong></div>}<div><p className="detail-label">Progress</p><strong>{project.progress}%</strong></div></div><div className="next-action"><p className="detail-label">Najbližší krok</p><p>{project.nextAction}</p></div>{project.blocker&&<div className="blocker"><p className="detail-label">Blokér</p><p>{project.blocker}</p>{project.waitingFor&&<strong>Čaká na: {project.waitingFor}</strong>}</div>}<button className="button-primary full" onClick={onClose}><ArrowLeft size={16}/>Späť na portfólio</button></div></div>
}

function SectionTitle({ eyebrow,title,action }: { eyebrow?:string; title:string; action?:React.ReactNode }) { return <div className="section-title"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div> }
function PageIntro({ eyebrow,title,text }: { eyebrow:string; title:string; text:string }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div> }
function EmptyState({ icon:Icon,title,text }: { icon:LucideIcon; title:string; text:string }) { return <div className="empty"><span><Icon size={21}/></span><h3>{title}</h3><p>{text}</p></div> }
