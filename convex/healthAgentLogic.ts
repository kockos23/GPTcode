import type { PlanningSignal } from "./personalOpsLogic"

export type GarminDailyMetrics = {
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  averageStress?: number
  intensityMinutes?: number
  activeCalories?: number
  bodyBatteryLow?: number
  bodyBatteryHigh?: number
  activities?: number
}

export type HealthBaseline = {
  restingHeartRate?: number
  sleepMinutes?: number
}

function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined
}

export function normalizeGarminDaily(value: unknown): GarminDailyMetrics {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    steps: finite(row.steps, 0, 200_000),
    sleepMinutes: finite(row.sleepMinutes, 0, 1_440),
    restingHeartRate: finite(row.restingHeartRate, 20, 250),
    averageStress: finite(row.averageStress, 0, 100),
    intensityMinutes: finite(row.intensityMinutes, 0, 1_440),
    activeCalories: finite(row.activeCalories, 0, 20_000),
    bodyBatteryLow: finite(row.bodyBatteryLow, 0, 100),
    bodyBatteryHigh: finite(row.bodyBatteryHigh, 0, 100),
    activities: finite(row.activities, 0, 100),
  }
}

export function analyzeHealthDay(input: {
  date: string
  metrics: GarminDailyMetrics
  baseline?: HealthBaseline
  occurredAt: number
}): PlanningSignal[] {
  const signals: PlanningSignal[] = []
  const { metrics, baseline } = input
  if (metrics.sleepMinutes !== undefined && metrics.sleepMinutes < 300) {
    signals.push({
      signalId: `health:sleep:${input.date}`, domain: "HEALTH", title: "Veľmi krátky spánok",
      summary: `Garmin zaznamenal ${Math.round(metrics.sleepMinutes / 6) / 10} h spánku. Navrhnúť opatrnú úpravu dennej záťaže.`,
      severity: "HIGH", occurredAt: input.occurredAt,
    })
  } else if (metrics.sleepMinutes !== undefined && metrics.sleepMinutes < 390) {
    signals.push({
      signalId: `health:sleep:${input.date}`, domain: "HEALTH", title: "Kratší spánok",
      summary: `Garmin zaznamenal ${Math.round(metrics.sleepMinutes / 6) / 10} h spánku. Zohľadniť pri plánovaní tréningu.`,
      severity: "ATTENTION", occurredAt: input.occurredAt,
    })
  }
  if (metrics.restingHeartRate !== undefined && baseline?.restingHeartRate !== undefined) {
    const increase = metrics.restingHeartRate - baseline.restingHeartRate
    if (increase >= 10) signals.push({
      signalId: `health:rhr:${input.date}`, domain: "HEALTH", title: "Odchýlka pokojového tepu",
      summary: `Pokojový tep je o ${Math.round(increase)} bpm nad osobným základom. Navrhnúť ľahší deň a sledovanie trendu.`,
      severity: "HIGH", occurredAt: input.occurredAt,
    })
  }
  if (metrics.averageStress !== undefined && metrics.averageStress >= 70) signals.push({
    signalId: `health:stress:${input.date}`, domain: "HEALTH", title: "Vyššia denná záťaž",
    summary: `Priemerný Garmin stress je ${Math.round(metrics.averageStress)}. Skontrolovať spánok, tréning a kalendár pred návrhom zmeny.`,
    severity: "ATTENTION", occurredAt: input.occurredAt,
  })
  return signals
}
