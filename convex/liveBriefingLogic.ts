export type BriefingEmail = {
  id: string
  threadId: string
  subject: string
  sender: string
  timestamp: string
  preview: string
  bodyText?: string
  bodyHtml?: string
  sourceAccount?: string
  url: string
  important: boolean
  triageState?: "INBOX" | "ARCHIVED" | "MOVED"
  triageFolder?: string
}

const REQUIRED_TEXT = ["id", "threadId", "subject", "sender", "timestamp", "preview", "url"] as const

export function toBriefingEmail(value: unknown): BriefingEmail {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const email: BriefingEmail = {
    id: "", threadId: "", subject: "", sender: "", timestamp: "", preview: "", url: "", important: false,
  }
  for (const key of REQUIRED_TEXT) {
    if (typeof row[key] === "string") email[key] = row[key]
  }
  if (typeof row.bodyText === "string") email.bodyText = row.bodyText
  if (typeof row.bodyHtml === "string") email.bodyHtml = row.bodyHtml
  if (typeof row.sourceAccount === "string") email.sourceAccount = row.sourceAccount
  if (typeof row.important === "boolean") email.important = row.important
  if (row.triageState === "INBOX" || row.triageState === "ARCHIVED" || row.triageState === "MOVED") email.triageState = row.triageState
  if (typeof row.triageFolder === "string") email.triageFolder = row.triageFolder
  return email
}

export function toBriefingEmails(value: unknown): BriefingEmail[] {
  return Array.isArray(value) ? value.map(item => toBriefingEmail(item)) : []
}
