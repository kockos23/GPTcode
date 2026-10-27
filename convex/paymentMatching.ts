export type MatchableTransaction = {
  id: string
  amount: number
  currency: string
  bookedOn: string
  counterpartyName: string
  variableSymbol: string
  note: string
  recipientMessage: string
}

export type MatchablePayable = {
  id: string
  supplier: string
  invoiceNumber: string
  dueDate: string
  amount: string
  currency: string
  paymentStatus: string
  paidAmount?: string
}

export type PaymentMatch = {
  payableId: string
  score: number
  reason: string
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function reference(value: string): string {
  const compact = normalized(value).replace(/\s+/g, "")
  const digits = compact.replace(/\D/g, "").replace(/^0+/, "")
  return digits || compact
}

function amount(value: string | undefined): number {
  const compact = (value ?? "").replace(/\s/g, "")
  const parsed = Number(compact.includes(",") && compact.includes(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

function paid(status: string): boolean {
  return ["uhradene", "paid", "zaplatene"].includes(normalized(status))
}

function dateDistance(left: string, right: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right)) return null
  const value = Math.abs(Date.parse(left + "T12:00:00Z") - Date.parse(right + "T12:00:00Z")) / 86_400_000
  return Number.isFinite(value) ? value : null
}

function supplierOverlap(supplier: string, counterparty: string): boolean {
  const supplierTokens = normalized(supplier).split(" ").filter(token => token.length >= 3)
  const counterpartyValue = normalized(counterparty)
  if (!supplierTokens.length || !counterpartyValue) return false
  return supplierTokens.some(token => counterpartyValue.includes(token))
}

export function findBestPayableMatch(
  transaction: MatchableTransaction,
  payables: MatchablePayable[],
): PaymentMatch | null {
  if (!Number.isFinite(transaction.amount) || transaction.amount >= 0) return null
  const paymentAmount = Math.abs(transaction.amount)
  const message = normalized(`${transaction.recipientMessage} ${transaction.note}`)
  const variableSymbol = reference(transaction.variableSymbol)
  const candidates = payables.flatMap(payable => {
    if (paid(payable.paymentStatus) || payable.currency.toUpperCase() !== transaction.currency.toUpperCase()) return []
    const remaining = Math.max(0, amount(payable.amount) - amount(payable.paidAmount))
    if (remaining <= 0 || paymentAmount > remaining + 0.01) return []
    const exactAmount = Math.abs(paymentAmount - remaining) <= 0.01
    const invoiceReference = reference(payable.invoiceNumber)
    const exactReference = Boolean(variableSymbol && invoiceReference && variableSymbol === invoiceReference)
    const referenceInMessage = Boolean(invoiceReference && message.replace(/\s+/g, "").includes(invoiceReference))
    const supplier = supplierOverlap(payable.supplier, transaction.counterpartyName)
    const distance = dateDistance(transaction.bookedOn, payable.dueDate)
    let score = exactAmount ? 50 : 15
    const reasons = [exactAmount ? "rovnaká zostávajúca suma" : "možná čiastočná úhrada"]
    if (exactReference) { score += 50; reasons.push("zhodný variabilný symbol") }
    else if (referenceInMessage) { score += 35; reasons.push("číslo faktúry v správe") }
    if (supplier) { score += 20; reasons.push("zhodný dodávateľ") }
    if (distance !== null && distance <= 7) { score += 10; reasons.push("dátum blízko splatnosti") }
    else if (distance !== null && distance <= 30) { score += 5; reasons.push("dátum v okolí splatnosti") }
    if (!exactAmount && !exactReference && !referenceInMessage) return []
    if (score < 70) return []
    return [{ payableId: payable.id, score, reason: reasons.join(", ") }]
  }).sort((left, right) => right.score - left.score)

  if (!candidates.length) return null
  if (candidates[1] && candidates[0].score - candidates[1].score < 15) return null
  return candidates[0]
}

