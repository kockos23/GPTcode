// A Gmail thread is in the inbox when any of its messages has INBOX.
// Drafts cannot take labels, and sent messages often do not have INBOX, so
// requiring the label on every message rejects a restore that already succeeded.

export function assertGmailThreadTriage(state, messages) {
  const list = Array.isArray(messages) ? messages : []
  if (!list.length) throw new Error("Gmail nevrátil správy upraveného vlákna")
  const inboxCount = list.filter(message => Array.isArray(message?.labelIds) && message.labelIds.includes("INBOX")).length
  if (state === "INBOX" && inboxCount < 1) throw new Error("Gmail nepotvrdil návrat vlákna do Inboxu")
  if (state !== "INBOX" && inboxCount > 0) throw new Error("Gmail nepotvrdil archivovanie celého vlákna")
  return { ok: true, inboxCount, messageCount: list.length }
}
