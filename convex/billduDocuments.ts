type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
}

function firstText(source: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function isoDate(value: string): string {
  if (!value) return ""
  const direct = value.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    const parsed = new Date(direct + "T00:00:00Z")
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === direct) return direct
  }
  const match = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/)
  if (!match) return ""
  return isoDate(`${match[3]}-${match[2]}-${match[1]}`)
}

function numberValue(source: UnknownRecord, keys: string[]): number | null {
  const raw = firstText(source, keys).replace(/\s/g, "")
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export type BillduDocumentCandidate = {
  id: string
  documentId: string
  invoiceNumber: string
  status: string
  type: string
  issueDate: string
  deliveryDate: string
  dueDate: string
  currency: string
  totalAmount: number | null
  customer: string
  safeToImport: boolean
  reviewReasons: string[]
}

export function billduRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const root = record(value)
  for (const key of ["data", "documents", "items", "results"]) if (Array.isArray(root[key])) return root[key] as unknown[]
  return []
}

export function normalizeBillduDocument(value: unknown): BillduDocumentCandidate {
  const source = record(value)
  const customerRecord = record(source.customer ?? source.client)
  const id = firstText(source, ["id", "documentId", "document_id"])
  const status = firstText(source, ["status", "documentStatus", "document_status"]).toLocaleLowerCase("sk")
  const type = firstText(source, ["type", "documentType", "document_type"]).toLocaleLowerCase("sk")
  const deliveryDate = isoDate(firstText(source, ["deliveryDate", "delivery_date", "dateOfSupply", "date_of_supply", "taxDate", "tax_date"]))
  const issueDate = isoDate(firstText(source, ["issueDate", "issue_date", "date", "createdDate", "created_date"]))
  const dueDate = isoDate(firstText(source, ["dueDate", "due_date", "maturityDate", "maturity_date"]))
  const currency = firstText(source, ["currency", "currencyCode", "currency_code"]).toUpperCase()
  const totalAmount = numberValue(source, ["total", "totalAmount", "total_amount", "amount", "priceTotal", "price_total"])
  const invoiceNumber = firstText(source, ["number", "documentNumber", "document_number", "invoiceNumber", "invoice_number"])
  const reviewReasons: string[] = []
  if (!id) reviewReasons.push("Chýba Billdu ID")
  if (!invoiceNumber) reviewReasons.push("Chýba číslo faktúry")
  if (!deliveryDate) reviewReasons.push("Chýba dátum dodania")
  if (!/^[A-Z]{3}$/.test(currency)) reviewReasons.push("Chýba platná mena")
  if (totalAmount === null || totalAmount < 0) reviewReasons.push("Chýba platná suma")
  if (["draft", "cancelled", "canceled", "void", "deleted", "storno"].includes(status)) reviewReasons.push("Doklad nie je vystavená faktúra")
  return {
    id,
    documentId: id ? `billdu:${id}` : "",
    invoiceNumber,
    status,
    type,
    issueDate,
    deliveryDate,
    dueDate,
    currency,
    totalAmount,
    customer: firstText(customerRecord, ["name", "companyName", "company_name"]) || firstText(source, ["customerName", "customer_name", "clientName", "client_name"]),
    safeToImport: reviewReasons.length === 0,
    reviewReasons,
  }
}
