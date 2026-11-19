export function decisionPatch(input: { status: string; answer?: string; updatedAt: number }) {
  const patch: { status: string; updatedAt: number; answer?: string } = {
    status: input.status.slice(0, 40),
    updatedAt: input.updatedAt,
  }
  if (input.answer !== undefined) patch.answer = input.answer.trim().slice(0, 5000)
  return patch
}

export function manualSubscriptionRecord(input: {
  subscriptionId: string
  name: string
  provider: string
  amount?: number
  currency: string
  billingCycle: string
  nextRenewalAt?: number
  updatedAt: number
}) {
  const row: {
    subscriptionId: string
    name: string
    provider: string
    category: "PERSONAL"
    currency: string
    billingCycle: string
    status: "ACTIVE"
    source: "HOME_WORKSPACE"
    updatedAt: number
    amount?: number
    nextRenewalAt?: number
  } = {
    subscriptionId: input.subscriptionId,
    name: input.name,
    provider: input.provider,
    category: "PERSONAL",
    currency: input.currency,
    billingCycle: input.billingCycle,
    status: "ACTIVE",
    source: "HOME_WORKSPACE",
    updatedAt: input.updatedAt,
  }
  if (input.amount !== undefined) row.amount = input.amount
  if (input.nextRenewalAt !== undefined) row.nextRenewalAt = input.nextRenewalAt
  return row
}

function bounded(value: string, max: number) {
  return value.trim().slice(0, max)
}

export function subscriptionUpsertRecord(args: {
  subscriptionId: string
  name: string
  provider: string
  category: string
  billingCycle: string
  status: string
  source: string
  amount?: number
  currency?: string
  nextRenewalAt?: number
  cancellationUrl?: string
}, updatedAt: number) {
  const row: {
    subscriptionId: string
    name: string
    provider: string
    category: string
    billingCycle: string
    status: string
    source: string
    updatedAt: number
    amount?: number
    currency?: string
    nextRenewalAt?: number
    cancellationUrl?: string
  } = {
    subscriptionId: bounded(args.subscriptionId, 120),
    name: bounded(args.name, 300),
    provider: bounded(args.provider, 200),
    category: bounded(args.category, 80),
    billingCycle: bounded(args.billingCycle, 40),
    status: bounded(args.status, 40),
    source: bounded(args.source, 100),
    updatedAt,
  }
  if (args.amount !== undefined) row.amount = args.amount
  if (args.currency) row.currency = bounded(args.currency.toUpperCase(), 3)
  if (args.nextRenewalAt !== undefined) row.nextRenewalAt = args.nextRenewalAt
  if (args.cancellationUrl) row.cancellationUrl = bounded(args.cancellationUrl, 1000)
  return row
}
