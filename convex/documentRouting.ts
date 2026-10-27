export const FINANCE_CATEGORIES = ["Doklady", "Stripe", "Vypisy", "Vystavene_FA"] as const

export type FinanceCategory = typeof FINANCE_CATEGORIES[number]

export type RoutingDecision = {
  ok: boolean
  category?: FinanceCategory
  deliveryDate?: string
  evidence?: string
  reason?: string
}

type RoutingInput = {
  fileName: string
  subject: string
  mimeType: string
  text: string
}

const DATE_TOKEN = String.raw`(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2})`

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function isoDate(raw: string): string | null {
  const value = raw.trim()
  let year = 0
  let month = 0
  let day = 0
  const iso = value.match(/^(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})$/)
  const local = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (local) {
    day = Number(local[1])
    month = Number(local[2])
    year = Number(local[3])
    if (year < 100) year += 2000
  } else {
    return null
  }
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 2000 || year > 2100 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function datesIn(value: string): string[] {
  const matches = value.match(new RegExp(DATE_TOKEN, "g")) ?? []
  return matches.map(isoDate).filter((date): date is string => Boolean(date))
}

function dateAfterLabel(text: string, labels: { label: string; source: string }[], preferLast = false) {
  for (const item of labels) {
    const position = text.indexOf(item.label)
    if (position < 0) continue
    const window = text.slice(position + item.label.length, position + item.label.length + 140)
    const dates = datesIn(window)
    if (dates.length) return {
      date: preferLast ? dates[dates.length - 1] : dates[0],
      source: item.source,
    }
  }
  return null
}

const DELIVERY_LABELS = [
  { label: "datum dodania", source: "Dátum dodania" },
  { label: "datum zdanitelneho plnenia", source: "Dátum zdaniteľného plnenia" },
  { label: "datum vzniku danovej povinnosti", source: "Dátum vzniku daňovej povinnosti" },
  { label: "den dodania", source: "Deň dodania" },
  { label: "datum uskutecneni zdanitelneho plneni", source: "DUZP" },
  { label: "duzp", source: "DUZP" },
  { label: "date of supply", source: "Date of supply" },
  { label: "date of taxable supply", source: "Date of taxable supply" },
  { label: "supply date", source: "Supply date" },
  { label: "tax point", source: "Tax point" },
  { label: "delivery date", source: "Delivery date" },
  { label: "service date", source: "Service date" },
  { label: "leistungsdatum", source: "Leistungsdatum" },
  { label: "data dostawy", source: "Data dostawy" },
  { label: "data sprzedazy", source: "Data sprzedaży" },
] as const

const DELIVERY_PERIOD_LABELS = [
  { label: "obdobie dodania", source: "Obdobie dodania" },
  { label: "obdobi plneni", source: "Období plnění" },
  { label: "service period", source: "Service period" },
  { label: "supply period", source: "Supply period" },
  { label: "leistungszeitraum", source: "Leistungszeitraum" },
] as const

const STATEMENT_PERIOD_LABELS = [
  { label: "statement period", source: "Statement period" },
  { label: "vypis za obdobie", source: "Výpis za obdobie" },
  { label: "vypis za obdobi", source: "Výpis za období" },
  { label: "obdobie", source: "Obdobie výpisu" },
  { label: "period", source: "Report period" },
] as const

function categoryFor(input: RoutingInput, text: string): FinanceCategory {
  const hints = normalize(`${input.fileName} ${input.subject}`)
  const sample = text.slice(0, 30_000)
  if (/\bstripe\b/.test(`${hints} ${sample}`)) return "Stripe"
  if (
    /\[(?:vystavene|issued)[ _-]?(?:fa|invoice)?\]/.test(hints) ||
    /\b(vystavena faktura|vystavena fa|issued invoice|sales invoice)\b/.test(`${hints} ${sample}`)
  ) return "Vystavene_FA"
  if (
    /\b(vypis|statement|bank statement)\b/.test(hints) ||
    /(id operacie|zaciatocny stav uctu|konecny stav uctu|account statement|opening balance|closing balance)/.test(sample)
  ) return "Vypisy"
  return "Doklady"
}

export function routeFinanceDocument(input: RoutingInput): RoutingDecision {
  const text = normalize(input.text)
  if (text.length < 30) {
    return {
      ok: false,
      reason: "Z dokumentu sa nepodarilo získať čitateľný text. Vyžaduje OCR alebo manuálnu kontrolu.",
    }
  }

  const category = categoryFor(input, text)
  const exactDelivery = dateAfterLabel(text, [...DELIVERY_LABELS])
  const deliveryPeriod = dateAfterLabel(text, [...DELIVERY_PERIOD_LABELS], true)
  const reportPeriod = dateAfterLabel(text, [...STATEMENT_PERIOD_LABELS], true)
  const resolved = category === "Vypisy" || category === "Stripe"
    ? reportPeriod ?? exactDelivery ?? deliveryPeriod
    : exactDelivery ?? deliveryPeriod

  if (!resolved) {
    return {
      ok: false,
      category,
      reason: category === "Vypisy" || category === "Stripe"
        ? "V dokumente sa nenašlo jednoznačné obdobie výpisu alebo reportu."
        : "V dokumente sa nenašiel jednoznačný dátum dodania alebo zdaniteľného plnenia.",
    }
  }

  return {
    ok: true,
    category,
    deliveryDate: resolved.date,
    evidence: `${resolved.source}: ${resolved.date}`,
  }
}

