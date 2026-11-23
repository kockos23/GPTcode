export function imapTriageMailboxes(state, previousLabel, targetLabel) {
  const targetMailbox = state === "INBOX" ? "INBOX" : state === "ARCHIVED" ? "Archive" : targetLabel
  const sourceMailbox = state === "INBOX" ? (previousLabel || "Archive") : "INBOX"
  return { sourceMailbox, targetMailbox }
}
