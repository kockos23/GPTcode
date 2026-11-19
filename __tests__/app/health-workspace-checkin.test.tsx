import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { saveCheckin } = vi.hoisted(() => ({ saveCheckin: vi.fn(async () => ({ ok: true })) }))

vi.mock("convex/react", () => ({
  useQuery: () => ({ daily: [], habits: [], checkins: [], logs: [], supplements: [] }),
  useMutation: (ref: { _name?: string }) => String(ref?._name ?? "").includes("saveCheckin") ? saveCheckin : vi.fn(async () => ({ ok: true })),
}))

vi.mock("convex/server", () => ({
  makeFunctionReference: (name: string) => ({ _name: name }),
}))

import { HealthWorkspace } from "@/components/health-workspace"

describe("HealthWorkspace check-in", () => {
  it("keeps the saved note when another score is added", () => {
    render(<HealthWorkspace notify={() => {}} />)
    fireEvent.change(screen.getByLabelText("Nálada"), { target: { value: "7" } })
    fireEvent.change(screen.getByPlaceholderText("Poznámka: choroba, alkohol, cestovanie, náročný deň…"), { target: { value: "cestovanie" } })
    fireEvent.click(screen.getByRole("button", { name: "Uložiť check-in" }))
    fireEvent.change(screen.getByLabelText("Energia"), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("button", { name: "Uložiť check-in" }))

    expect(saveCheckin).toHaveBeenNthCalledWith(1, expect.objectContaining({ mood: 7, note: "cestovanie" }))
    expect(saveCheckin).toHaveBeenNthCalledWith(2, expect.objectContaining({ mood: 7, energy: 4, note: "cestovanie" }))
  })
})