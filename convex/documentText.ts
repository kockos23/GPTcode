import { extractText, getDocumentProxy } from "unpdf"

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

export type ExtractedDocumentText = {
  text: string
  method: "PDF_TEXT" | "PLAIN_TEXT" | "UNSUPPORTED"
  reason?: string
}

function extension(name: string): string {
  return name.toLowerCase().split(".").pop() ?? ""
}

export async function extractDocumentText(
  sourceUrl: string,
  fileName: string,
  mimeType: string,
): Promise<ExtractedDocumentText> {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(60_000)
    : undefined
  const response = await fetch(sourceUrl, signal ? { signal } : undefined)
  if (!response.ok) throw new Error(`Prílohu sa nepodarilo načítať (${response.status}).`)
  const declaredSize = Number(response.headers.get("content-length") ?? 0)
  if (declaredSize > MAX_DOCUMENT_BYTES) throw new Error("Príloha je väčšia ako povolených 15 MB.")
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new Error("Príloha je väčšia ako povolených 15 MB.")

  const ext = extension(fileName)
  if (ext === "pdf" || mimeType.toLowerCase().includes("pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const extracted = await extractText(pdf, { mergePages: true })
    return {
      text: extracted.text,
      method: "PDF_TEXT",
      ...(!extracted.text.trim() ? { reason: "PDF neobsahuje textovú vrstvu a vyžaduje OCR." } : {}),
    }
  }

  if (["csv", "xml", "txt"].includes(ext) || /(?:csv|xml|text)/i.test(mimeType)) {
    return { text: new TextDecoder().decode(buffer), method: "PLAIN_TEXT" }
  }

  return {
    text: "",
    method: "UNSUPPORTED",
    reason: "Tento formát zatiaľ nemá bezpečnú textovú extrakciu a vyžaduje manuálnu kontrolu.",
  }
}

