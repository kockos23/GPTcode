import fs from "node:fs"
import { describe, expect, it } from "vitest"

const financeModules = [
  "wofFinance.ts",
  "bankStatements.ts",
  "financeCommands.ts",
  "financeReviews.ts",
  "financeHealth.ts",
  "financeIntake.ts",
]

function publicActionBlocks(source: string): Array<{ name: string; block: string }> {
  const matches = [...source.matchAll(/export const (\w+) = action\(\{/g)]
  return matches.map((match, index) => ({
    name: match[1],
    block: source.slice(match.index, matches[index + 1]?.index ?? source.length),
  }))
}

describe("finance authorization policy", () => {
  for (const file of financeModules) {
    const source = fs.readFileSync(`${process.cwd()}/convex/${file}`, "utf8")

    it(`${file} protects every public action with owner access`, () => {
      const actions = publicActionBlocks(source)
      expect(actions.length, `${file} should expose at least one guarded action`).toBeGreaterThan(0)
      for (const action of actions) {
        expect(action.block, `${file}:${action.name} must load currentAccess`).toContain("api.authz.currentAccess")
        expect(action.block, `${file}:${action.name} must reject unauthorized access`).toMatch(/!access\.allowed/)
      }
    })

    it(`${file} exposes no unguarded public query or mutation`, () => {
      expect(source).not.toMatch(/export const \w+ = (?:query|mutation)\(\{/)
    })
  }
})
