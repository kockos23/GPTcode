export const PERSONAL_DOMAINS = ["EXECUTIVE", "HEALTH", "HOME", "VEHICLE", "FINANCE"] as const
export type PersonalDomain = (typeof PERSONAL_DOMAINS)[number]

export const SIGNAL_SEVERITIES = ["INFO", "ATTENTION", "HIGH", "CRITICAL"] as const
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number]

export type PlanningSignal = {
  signalId: string
  domain: PersonalDomain
  title: string
  summary: string
  severity: SignalSeverity
  occurredAt: number
  dueAt?: number
}

export type PlannedAction = {
  signalId: string
  domain: PersonalDomain
  assignedAgent: string
  title: string
  priority: "P0" | "P1" | "P2" | "P3"
  approval: "NONE" | "OWNER"
  reason: string
  dueAt?: number
}

const AGENT_BY_DOMAIN: Record<PersonalDomain, string> = {
  EXECUTIVE: "NORA",
  HEALTH: "HEALTH_COACH",
  HOME: "HOME_MANAGER",
  VEHICLE: "VEHICLE_MANAGER",
  FINANCE: "SARA_FINANCE",
}

const SEVERITY_SCORE: Record<SignalSeverity, number> = {
  INFO: 0,
  ATTENTION: 20,
  HIGH: 50,
  CRITICAL: 100,
}

function dueScore(now: number, dueAt?: number): number {
  if (!dueAt) return 0
  const days = (dueAt - now) / 86_400_000
  if (days < 0) return 80
  if (days <= 1) return 60
  if (days <= 3) return 40
  if (days <= 14) return 20
  return 0
}

function priority(score: number): PlannedAction["priority"] {
  if (score >= 120) return "P0"
  if (score >= 70) return "P1"
  if (score >= 30) return "P2"
  return "P3"
}

export function planSignals(signals: PlanningSignal[], now: number, limit = 12): PlannedAction[] {
  return signals
    .map(signal => {
      const score = SEVERITY_SCORE[signal.severity] + dueScore(now, signal.dueAt)
      return {
        signalId: signal.signalId,
        domain: signal.domain,
        assignedAgent: AGENT_BY_DOMAIN[signal.domain],
        title: signal.title,
        priority: priority(score),
        approval: signal.domain === "HEALTH" ? "OWNER" as const : "NONE" as const,
        reason: signal.dueAt && signal.dueAt < now
          ? `Termín je po splatnosti. ${signal.summary}`.trim()
          : signal.summary,
        dueAt: signal.dueAt,
        score,
      }
    })
    .sort((left, right) => right.score - left.score || (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity) || left.signalId.localeCompare(right.signalId))
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))))
    .map(({ score: _score, ...action }) => action)
}

export function requiresOwnerApproval(input: { domain: PersonalDomain; action: string }): boolean {
  const action = input.action.toLocaleUpperCase("sk")
  if (input.domain === "HEALTH" && /(CHANGE|MOVE|CANCEL|TRAINING|MEDICATION)/.test(action)) return true
  return /(SEND|PURCHASE|BOOK|DELETE|PAY|CREATE_CALENDAR|MOVE_CALENDAR)/.test(action)
}
