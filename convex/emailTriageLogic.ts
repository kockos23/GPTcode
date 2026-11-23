export type EmailTriageState = "INBOX" | "ARCHIVED" | "MOVED"

export function buildEmailTriageContext(input: {
  state: EmailTriageState
  folder: string
  previousFolder: string
  sourceAccount: string
}): string {
  return [
    "EmailTriage",
    input.state,
    encodeURIComponent(input.folder),
    encodeURIComponent(input.previousFolder),
    encodeURIComponent(input.sourceAccount),
  ].join("|")
}

function decodePart(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? "")
  } catch {
    return ""
  }
}

export function parseEmailTriageContext(contextType: string): {
  state: EmailTriageState
  folder: string
  previousFolder: string
  sourceAccount: string
} | null {
  if (!contextType.startsWith("EmailTriage|")) return null
  const parts = contextType.split("|")
  const state = parts[1]
  if (state !== "INBOX" && state !== "ARCHIVED" && state !== "MOVED") return null
  return {
    state,
    folder: decodePart(parts[2]).slice(0, 100),
    previousFolder: decodePart(parts[3]).slice(0, 100),
    sourceAccount: decodePart(parts[4]).slice(0, 200),
  }
}
