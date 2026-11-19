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

function removeTechnicalNoise(value: string) {
  let text = value
    .replace(/^https?:\/\/[^\s]*?(?=(?:Vážený|Dobrý deň|Ahoj|Hello|Dear)\s)/i, "")
    .replace(/text version of this email is not supported\s*/gi, "")
    .replace(/click on the link below to open (?:the|this) message in (?:a|your) browser:?\s*/gi, "")
    .replace(/view (?:this email|it) in (?:your )?browser\.?\s*/gi, "")
    .replace(/https?:\/\/[^\s<>'\"]+/gi, " ")

  const footer = /\b(?:you(?:'|’)ve received this email because|if you (?:feel you )?received (?:this|it) by mistake|manage (?:your )?(?:preferences|consent)|unsubscribe(?: from)?|odhlásiť (?:sa|odber)|zrušiť odber)\b/i.exec(text)
  if (footer) text = text.slice(0, footer.index)
  const quotedReply = /\b(?:On .{0,120} wrote:|Dňa .{0,120} napísal(?:a)?:)\s*/i.exec(text)
  if (quotedReply && quotedReply.index > 40) text = text.slice(0, quotedReply.index)

  return text
    .replace(/\b(?:utm_[a-z]+|wixToken|mc_cid|mc_eid)=[^\s]+/gi, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])(?=[A-ZÁÄČĎÉÍĽĹŇÓÔŔŠŤÚÝŽ])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim()
}

export function cleanEmailPreview(input: string | null | undefined): string {
  const source = String(input ?? "").trim()
  if (!source) return ""
  const looksLikeHtml = /<!doctype|<html\b|<body\b|<table\b|<div\b|<p\b|<br\s*\/?\s*>/i.test(source)
  if (!looksLikeHtml) {
    const plainText = removeTechnicalNoise(decodeEntities(source))
    return plainText || FALLBACK
  }

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

  const clean = removeTechnicalNoise(text)
  if (!clean || /^(?:BEGIN|END) (?:TEMPLATE|HEADER)/i.test(clean) || clean.length < 12) return FALLBACK
  return clean
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
