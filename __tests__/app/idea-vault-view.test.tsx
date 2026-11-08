import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const capture = {
  id: "c1", sourceKey: "telegram:1:2", source: "telegram", kind: "link", receivedAt: Date.now(), rawText: "https://example.com",
  caption: "", urls: ["https://example.com/jtbd"], analysisStatus: "ok", analysisIssues: [], title: "Jobs to be Done pre eventy",
  summary: "Ako zistiť, prečo ľudia chodia na eventy.", category: "Framework", keyPoints: ["Ľudia si najímajú produkty"],
  frameworks: [{ name: "JTBD", whenToUse: "Pri návrhu MVP", steps: ["Identifikuj job"] }],
  businessIdeas: [{ title: "JTBD audit", problem: "Nejasná motivácia účastníkov", audience: "Organizátori", firstStep: "3 rozhovory" }],
  relevanceScore: 86, relevanceWhy: "Nadväzuje na WOF Event Platform", linkedFocus: ["WOF Event Platform"], nextActions: [],
  tags: ["jtbd"], relatedCaptureIds: [], profileSignals: [], stage: "inbox", starred: false, updatedAt: Date.now(), hasExtractedText: true,
}

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args: Record<string, unknown>) => {
    const name = String((ref as { _name?: string })?._name ?? "")
    if (name.includes("listCaptures")) return [capture]
    return {
      counts: { inbox: 1, library: 0, action: 0, archive: 0 }, failed: 0, themes: [{ tag: "jtbd", count: 1 }],
      signals: [{ captureId: "c1", captureTitle: "Jobs to be Done pre eventy", signal: "Product discovery" }], digest: null,
      profile: { focusAreas: ["WOF Event Platform"], activeProjects: [], goals: [], openQuestions: [], avoid: [], isDefault: true, updatedAt: null },
    }
  },
  useMutation: () => vi.fn(async () => null),
}))

vi.mock("convex/server", () => ({
  makeFunctionReference: (name: string) => ({ _name: name }),
}))

import { IdeaVaultView } from "@/components/idea-vault"

describe("IdeaVaultView", () => {
  it("shows the analyzed capture and expands frameworks and business ideas", () => {
    render(<IdeaVaultView notify={() => {}} />)
    expect(screen.getByText("Jobs to be Done pre eventy")).toBeInTheDocument()
    expect(screen.getByText("Product discovery")).toBeInTheDocument()
    expect(screen.getByText("86")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Jobs to be Done pre eventy/ }))
    expect(screen.getByText("Framework · JTBD")).toBeInTheDocument()
    expect(screen.getByText("Nadväzuje na WOF Event Platform")).toBeInTheDocument()
    expect(screen.getByText(/JTBD audit/)).toBeInTheDocument()
  })

  it("opens the profile editor prefilled with focus areas", () => {
    render(<IdeaVaultView notify={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Môj profil/ }))
    expect(screen.getByDisplayValue("WOF Event Platform")).toBeInTheDocument()
  })
})
