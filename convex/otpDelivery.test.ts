import { describe, expect, it } from "vitest"
import { createOtpDeliveryEnvelope, validateOtpDeliveryEnvelope } from "./otpDelivery"

const secret = "test-signing-secret"
const ownerEmail = "owner@example.com"
const now = 1_800_000_000_000

describe("OTP delivery envelope", () => {
  it("accepts a fresh signed owner token", async () => {
    const envelope = await createOtpDeliveryEnvelope(ownerEmail, "123456", secret, now)
    await expect(validateOtpDeliveryEnvelope(envelope, { secret, ownerEmail, now })).resolves.toBe(true)
  })

  it("rejects tampering and a different recipient", async () => {
    const envelope = await createOtpDeliveryEnvelope(ownerEmail, "123456", secret, now)
    await expect(validateOtpDeliveryEnvelope({ ...envelope, token: "654321" }, { secret, ownerEmail, now })).resolves.toBe(false)
    await expect(validateOtpDeliveryEnvelope(envelope, { secret, ownerEmail: "other@example.com", now })).resolves.toBe(false)
  })

  it("rejects expired envelopes", async () => {
    const envelope = await createOtpDeliveryEnvelope(ownerEmail, "123456", secret, now)
    await expect(validateOtpDeliveryEnvelope(envelope, { secret, ownerEmail, now: now + 6 * 60 * 1000 })).resolves.toBe(false)
  })
})
