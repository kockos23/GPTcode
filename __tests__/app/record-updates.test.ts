import { describe, expect, it } from "vitest"
import { decisionPatch, manualSubscriptionRecord, subscriptionUpsertRecord } from "../../convex/recordUpdates"

describe("decision status updates", () => {
  it("keeps a stored answer when approval does not send one", () => {
    const patch = decisionPatch({ status: "Schválené", answer: undefined, updatedAt: 10 })
    expect(patch).toEqual({ status: "Schválené", updatedAt: 10 })
    expect(patch).not.toHaveProperty("answer")
  })

  it("stores a trimmed answer when the owner writes one", () => {
    expect(decisionPatch({ status: "Vlastná odpoveď", answer: "  rozpočet max 5000 EUR  ", updatedAt: 11 })).toEqual({
      status: "Vlastná odpoveď",
      answer: "rozpočet max 5000 EUR",
      updatedAt: 11,
    })
  })
})

describe("subscription upserts", () => {
  it("omits a blank manual price and renewal so an existing row keeps them", () => {
    const row = manualSubscriptionRecord({
      subscriptionId: "manual:chatgpt-plus",
      name: "ChatGPT Plus",
      provider: "OpenAI Ireland",
      amount: undefined,
      currency: "EUR",
      billingCycle: "MONTHLY",
      nextRenewalAt: undefined,
      updatedAt: 20,
    })
    expect(row).not.toHaveProperty("amount")
    expect(row).not.toHaveProperty("nextRenewalAt")
    expect(row.provider).toBe("OpenAI Ireland")
  })

  it("keeps a supplied manual price and renewal date", () => {
    const row = manualSubscriptionRecord({
      subscriptionId: "manual:chatgpt-plus",
      name: "ChatGPT Plus",
      provider: "OpenAI",
      amount: 20,
      currency: "EUR",
      billingCycle: "MONTHLY",
      nextRenewalAt: Date.parse("2026-12-01T12:00:00Z"),
      updatedAt: 21,
    })
    expect(row.amount).toBe(20)
    expect(row.nextRenewalAt).toBe(Date.parse("2026-12-01T12:00:00Z"))
  })

  it("does not clear currency, price, renewal, or cancellation URL on a partial API upsert", () => {
    const row = subscriptionUpsertRecord({
      subscriptionId: "freeletics-revolut-benefit",
      name: "Freeletics",
      provider: "Revolut benefit",
      category: "HEALTH",
      billingCycle: "UNKNOWN",
      status: "ACTIVE",
      source: "MANUAL",
    }, 30)
    expect(row).not.toHaveProperty("amount")
    expect(row).not.toHaveProperty("currency")
    expect(row).not.toHaveProperty("nextRenewalAt")
    expect(row).not.toHaveProperty("cancellationUrl")
  })

  it("updates optional subscription fields when they are sent", () => {
    const row = subscriptionUpsertRecord({
      subscriptionId: "freeletics-revolut-benefit",
      name: "Freeletics",
      provider: "Revolut benefit",
      category: "HEALTH",
      amount: 0,
      currency: "eur",
      billingCycle: "MONTHLY",
      nextRenewalAt: 40,
      cancellationUrl: "https://example.com/cancel",
      status: "ACTIVE",
      source: "MANUAL",
    }, 31)
    expect(row.amount).toBe(0)
    expect(row.currency).toBe("EUR")
    expect(row.nextRenewalAt).toBe(40)
    expect(row.cancellationUrl).toBe("https://example.com/cancel")
  })
})
