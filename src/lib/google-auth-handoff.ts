import { ConvexError } from "convex/values"

const HANDOFF_KEY = "macalyGoogleHandoffVerifier"
const POPUP_PROOF_PREFIX = "macalyGooglePopupProof:"
const POPUP_PROOF_TTL_MS = 10 * 60 * 1000

export type GoogleAuthHandoffMode = "sign-in" | "link"

type GoogleAuthHandoff = {
  verifier: string
  mode: GoogleAuthHandoffMode
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

export function createGoogleAuthVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function createGoogleAuthChallenge(
  verifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  )
  return base64Url(new Uint8Array(digest))
}

export async function createGoogleAuthHandoff(
  mode: GoogleAuthHandoffMode = "sign-in",
): Promise<string> {
  const verifier = createGoogleAuthVerifier()
  // Store before the first await. The initiating Preview iframe retains this
  // verifier and redeems the popup's one-time result in its own auth context.
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ verifier, mode }))
  return createGoogleAuthChallenge(verifier)
}

export function storeGoogleAuthPopupProof(
  flowId: string,
  verifier: string,
): void {
  localStorage.setItem(
    `${POPUP_PROOF_PREFIX}${flowId}`,
    JSON.stringify({ verifier, createdAt: Date.now() }),
  )
}

export function takeGoogleAuthPopupProof(flowId: string): string | null {
  const key = `${POPUP_PROOF_PREFIX}${flowId}`
  const stored = localStorage.getItem(key)
  localStorage.removeItem(key)
  if (!stored) return null
  try {
    const proof = JSON.parse(stored) as {
      verifier?: unknown
      createdAt?: unknown
    }
    if (
      typeof proof.verifier !== "string" ||
      typeof proof.createdAt !== "number" ||
      Date.now() - proof.createdAt > POPUP_PROOF_TTL_MS
    ) {
      return null
    }
    return proof.verifier
  } catch {
    return null
  }
}

export function takeGoogleAuthHandoff(): GoogleAuthHandoff | null {
  const stored = sessionStorage.getItem(HANDOFF_KEY)
  sessionStorage.removeItem(HANDOFF_KEY)
  if (!stored) return null
  try {
    const handoff = JSON.parse(stored) as Partial<GoogleAuthHandoff>
    if (
      typeof handoff.verifier !== "string" ||
      (handoff.mode !== "sign-in" && handoff.mode !== "link")
    ) {
      return null
    }
    return { verifier: handoff.verifier, mode: handoff.mode }
  } catch {
    return null
  }
}

export function describeGoogleAuthError(
  error: unknown,
  mode: GoogleAuthHandoffMode,
): string {
  const code =
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data
      ? error.data.code
      : null

  if (code === "GOOGLE_ACCOUNT_LINKED_TO_ANOTHER_USER") {
    return "This Google account is already linked to another account. Use a different Google account or sign in to the account where it is already linked."
  }
  if (code === "USER_HAS_DIFFERENT_GOOGLE_ACCOUNT") {
    return "This account is already linked to a different Google account. Unlink it before linking another one."
  }
  if (code === "GOOGLE_LINK_REAUTH_REQUIRED") {
    return "For security, sign out and sign back in with your existing method, then try linking Google again."
  }
  if (code === "GOOGLE_LINK_TARGET_MISSING") {
    return "The account to link no longer exists. Sign in again and try linking Google."
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("cancelled") || message.includes("access_denied")) {
    return "Google sign-in was cancelled."
  }
  if (message.includes("popup was blocked")) {
    return "Google sign-in popup was blocked. Allow popups and try again."
  }
  if (message.includes("timed out")) {
    return "Google sign-in timed out. Please try again."
  }
  if (
    message.includes("invalid or expired") ||
    message.includes("handoff expired")
  ) {
    return "This sign-in link expired. Please try again."
  }

  return mode === "link"
    ? "Google could not be linked. Please try again."
    : "Google sign-in failed. Please try again."
}
