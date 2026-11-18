export type PairedObservation = {
  date: string
  exposure: number
  outcome: number
}

export type AssociationSummary = {
  status: "INSUFFICIENT_DATA" | "NO_COMPARISON" | "POSSIBLE_ASSOCIATION"
  sampleSize: number
  exposedDays: number
  comparisonDays: number
  exposedAverage?: number
  comparisonAverage?: number
  difference?: number
  message: string
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Descriptive comparison only. It deliberately does not claim causality and
 * requires both exposed and comparison days before returning a difference.
 */
export function summarizeAssociation(rows: PairedObservation[], minimumSample = 7): AssociationSummary {
  const valid = rows.filter(row =>
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.exposure) && Number.isFinite(row.outcome),
  )
  const exposed = valid.filter(row => row.exposure > 0).map(row => row.outcome)
  const comparison = valid.filter(row => row.exposure <= 0).map(row => row.outcome)
  if (valid.length < minimumSample) return {
    status: "INSUFFICIENT_DATA", sampleSize: valid.length, exposedDays: exposed.length, comparisonDays: comparison.length,
    message: `Na opis možnej súvislosti treba aspoň ${minimumSample} párových dní.`,
  }
  if (exposed.length < 3 || comparison.length < 3) return {
    status: "NO_COMPARISON", sampleSize: valid.length, exposedDays: exposed.length, comparisonDays: comparison.length,
    message: "Chýbajú aspoň tri dni v jednej z porovnávaných skupín.",
  }
  const exposedAverage = average(exposed)
  const comparisonAverage = average(comparison)
  const difference = exposedAverage - comparisonAverage
  return {
    status: "POSSIBLE_ASSOCIATION", sampleSize: valid.length, exposedDays: exposed.length, comparisonDays: comparison.length,
    exposedAverage, comparisonAverage, difference,
    message: `Pozorovaná súvislosť v ${valid.length} dňoch; výsledok nepreukazuje príčinu.`,
  }
}
