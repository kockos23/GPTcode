// @vitest-environment edge-runtime
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { internal } from "../../convex/_generated/api"
import schema from "../../convex/schema"

describe("payable payment lock", () => {
  it("lets the second payment proceed only after the first writer releases the invoice", async () => {
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"))
    const first = await t.mutation(internal.wofFinance.claimPayablePayments, {
      payableIds: ["invoice-1", "invoice-1"],
      owner: "payment-a",
    })
    const overlapping = await t.mutation(internal.wofFinance.claimPayablePayments, {
      payableIds: ["invoice-1"],
      owner: "payment-b",
    })
    expect(first.ok).toBe(true)
    expect(overlapping.ok).toBe(false)

    await t.mutation(internal.wofFinance.releasePayablePayments, {
      payableIds: ["invoice-1"],
      owner: "payment-a",
    })
    const afterRelease = await t.mutation(internal.wofFinance.claimPayablePayments, {
      payableIds: ["invoice-1"],
      owner: "payment-b",
    })
    expect(afterRelease.ok).toBe(true)
  })
})
