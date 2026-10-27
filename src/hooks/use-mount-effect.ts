import { type EffectCallback, useEffect } from "react"

/** Escape hatch for a browser handoff that must be consumed once on mount. */
export function useMountEffect(effect: EffectCallback): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [])
}
