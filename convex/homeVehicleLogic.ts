import type { PlanningSignal } from "./personalOpsLogic"

export type MaintenanceItem = {
  maintenanceId: string
  domain: "HOME" | "VEHICLE"
  title: string
  nextDueAt: number
  leadDays: number[]
}

export function dueMaintenanceSignals(items: MaintenanceItem[], now: number): PlanningSignal[] {
  return items.flatMap(item => {
    const days = Math.ceil((item.nextDueAt - now) / 86_400_000)
    const threshold = [...item.leadDays].sort((a, b) => a - b).find(value => days <= value)
    if (days > 0 && threshold === undefined) return []
    const stage = days < 0 ? `overdue-week-${Math.floor(Math.abs(days) / 7)}` : days === 0 ? "due-today" : `lead-${threshold}`
    return [{
      signalId: `maintenance:${item.maintenanceId}:${item.nextDueAt}:${stage}`,
      domain: item.domain,
      title: item.title,
      summary: days < 0 ? `Termín je ${Math.abs(days)} dní po splatnosti.` : days === 0 ? "Termín je dnes." : `Termín je o ${days} dní.`,
      severity: days < 0 ? "CRITICAL" as const : days <= 3 ? "HIGH" as const : "ATTENTION" as const,
      occurredAt: now,
      dueAt: item.nextDueAt,
    }]
  })
}

export function consumptionDelta(previous: number, current: number): number | null {
  if (![previous, current].every(value => Number.isFinite(value) && value >= 0)) return null
  if (current < previous) return null
  return current - previous
}

export function subscriptionRenewalSignal(input: {
  subscriptionId: string
  name: string
  nextRenewalAt?: number
  amount?: number
  currency?: string
  now: number
}): PlanningSignal | null {
  if (!input.nextRenewalAt) return null
  const days = Math.ceil((input.nextRenewalAt - input.now) / 86_400_000)
  if (days > 14) return null
  const stage = days < 0
    ? `overdue-week-${Math.floor(Math.abs(days) / 7)}`
    : days === 0 ? "due-today" : days <= 1 ? "lead-1" : days <= 3 ? "lead-3" : days <= 7 ? "lead-7" : "lead-14"
  const price = input.amount !== undefined ? ` za ${input.amount} ${input.currency ?? ""}`.trim() : ""
  return {
    signalId: `subscription:${input.subscriptionId}:${input.nextRenewalAt}:${stage}`,
    domain: "HOME",
    title: `Obnova predplatného ${input.name}`,
    summary: days < 0 ? `Predplatné sa malo obnoviť${price}.` : `Obnova je o ${days} dní${price}.`,
    severity: days <= 3 ? "HIGH" : "ATTENTION",
    occurredAt: input.now,
    dueAt: input.nextRenewalAt,
  }
}
