import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createBillduSignature } from "../../convex/billdu"

describe("Billdu HMAC authentication", () => {
  it("matches the official client top-level key sorting contract", async () => {
    const apiKey = "public-test-key"
    const secret = "private-test-secret"
    const timestamp = 1_798_800_000
    const expectedPayload = JSON.stringify({ apiKey, note: "invoice", timestamp, total: 125.5 })
    const expected = createHmac("sha512", secret).update(expectedPayload, "utf8").digest("base64")
    await expect(createBillduSignature({ total: 125.5, note: "invoice" }, apiKey, secret, timestamp)).resolves.toBe(expected)
  })

  it("does not include the API secret in the signed payload", async () => {
    const signature = await createBillduSignature({}, "key", "secret-value", 123)
    expect(signature).not.toContain("secret-value")
    expect(signature.length).toBeGreaterThan(60)
  })
})
