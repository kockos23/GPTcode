const FALLBACK = "HTML e-mail – celý obsah otvoríš bezpečne v Gmaili."

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  ndash: "–", mdash: "—", hellip: "…", bull: "•", euro: "€",
}

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x"
      const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " "
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? " "
  })
}

export function cleanEmailPreview(input: string | null | undefined): string {
  const source = String(input ?? "").trim()
  if (!source) return ""
  const looksLikeHtml = /<!doctype|<html\b|<body\b|<table\b|<div\b|<p\b|<br\s*\/?\s*>/i.test(source)
  if (!looksLikeHtml) return decodeEntities(source).replace(/\s+/g, " ").trim()

  const text = decodeEntities(source
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|table|section|article)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n+ */g, " \u2022 ")
    .replace(/(?:\s*\u2022\s*){2,}/g, " • ")
    .replace(/\s+/g, " ")
    .replace(/^(?:\s*\u2022\s*)+|(?:\s*\u2022\s*)+$/g, "")
    .trim()

  if (!text || /^(?:BEGIN|END) (?:TEMPLATE|HEADER)/i.test(text) || text.length < 12) return FALLBACK
  return text
}

export function emailPreviewForCard(input: string | null | undefined, maxLength = 220): string {
  const clean = cleanEmailPreview(input) || "Bez textového náhľadu – otvor správu v Gmaili."
  if (clean.length <= maxLength) return clean
  return clean.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…"
}

export function uniqueDisplayEmails<T extends { id:string; sender:string; subject:string; timestamp:string; preview:string }>(emails: T[]): T[] {
  const seen = new Set<string>()
  return emails.filter(email => {
    const key = [email.sender, email.subject, email.timestamp, cleanEmailPreview(email.preview)]
      .map(value => value.trim().toLocaleLowerCase("sk"))
      .join("\u0000")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
