// IMAP UIDs are valid only in the mailbox that issued them. MOVE assigns a
// new UID in the destination, so the UID stored at intake must not be reused
// to move that message out of Archive or back out of INBOX later.

export const IMAP_SEARCH_LIMIT = 20

const PLACEHOLDER_SUBJECT = "(bez predmetu)"

export function emailAddress(value) {
  if (!value) return ""
  if (typeof value === "string") {
    const angled = value.match(/<([^<>]+)>/)
    const bare = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
    return (angled?.[1] || bare?.[0] || "").trim().toLowerCase()
  }
  if (Array.isArray(value)) return emailAddress(value[0])
  if (typeof value === "object") {
    if (typeof value.address === "string" && value.address.trim()) return value.address.trim().toLowerCase()
    if (value.value) return emailAddress(value.value)
    if (typeof value.text === "string") return emailAddress(value.text)
  }
  return ""
}

export function normalizeSubject(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase()
}

export function instant(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value ?? ""))
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

export function imapMoveError(code) {
  if (code === "AMBIGUOUS") return "V zdrojovej schránke je viac správ s rovnakým predmetom a odosielateľom. Presun sa zastavil, aby sa nepresunula iná správa."
  if (code === "MISSING_IDENTITY") return "Správu v Archive nejde bezpečne nájsť bez predmetu a odosielateľa. UID z INBOX by mohlo patriť inej správe."
  return "V zdrojovej schránke sa nenašla správa s rovnakým predmetom a odosielateľom. Uložené IMAP UID sa nepoužije, lebo po presune platí len v pôvodnej schránke."
}

export function imapMoveRequest(email, state) {
  const sourceMailbox = state === "INBOX" ? "Archive" : "INBOX"
  const targetMailbox = state === "INBOX" ? "INBOX" : "Archive"
  const subject = String(email?.subject ?? "").trim()
  const senderAddress = emailAddress(email?.sender)
  const providerUid = String(email?.providerUid ?? "").trim()
  const identifiable = subject !== "" && subject !== PLACEHOLDER_SUBJECT && senderAddress !== ""
  if (!identifiable) {
    if (sourceMailbox === "INBOX" && providerUid) {
      return { ok: true, mode: "uid", sourceMailbox, targetMailbox, emailUid: providerUid, subject, senderAddress, timestamp: email?.timestamp }
    }
    return { ok: false, code: "MISSING_IDENTITY" }
  }
  return { ok: true, mode: "search", sourceMailbox, targetMailbox, subject, senderAddress, timestamp: email?.timestamp }
}

export function candidateUids(searchResult, limit = IMAP_SEARCH_LIMIT) {
  const found = Number(searchResult?.searchSummary?.totalFound ?? 0)
  const uids = Array.isArray(searchResult?.uids) ? searchResult.uids.map(uid => String(uid)).filter(Boolean) : []
  if (!Number.isInteger(found) || found < 1 || uids.length < 1) return { ok: false, code: "NOT_FOUND" }
  if (found > limit || uids.length !== found) return { ok: false, code: "AMBIGUOUS" }
  return { ok: true, uids }
}

export function selectMovedMessage(target, candidates) {
  const subject = normalizeSubject(target?.subject)
  const from = emailAddress(target?.sender)
  if (!subject || !from) return { ok: false, code: "MISSING_IDENTITY" }
  const exact = (Array.isArray(candidates) ? candidates : []).filter(candidate => {
    return normalizeSubject(candidate?.subject) === subject && emailAddress(candidate?.from) === from && String(candidate?.uid ?? "").trim() !== ""
  })
  if (exact.length === 1) return { ok: true, uid: String(exact[0].uid).trim() }
  if (exact.length === 0) return { ok: false, code: "NOT_FOUND" }
  const when = instant(target?.timestamp)
  if (Number.isNaN(when)) return { ok: false, code: "AMBIGUOUS" }
  const dated = exact.filter(candidate => {
    const at = instant(candidate?.date)
    return !Number.isNaN(at) && Math.abs(at - when) <= 5 * 60 * 1000
  })
  if (dated.length === 1) return { ok: true, uid: String(dated[0].uid).trim() }
  return { ok: false, code: "AMBIGUOUS" }
}

export function imapMoveHelpersSource() {
  return [emailAddress, normalizeSubject, instant, imapMoveError, imapMoveRequest, candidateUids, selectMovedMessage].map(fn => fn.toString()).join("\n")
}
