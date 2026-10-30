const BILLDU_API_BASE_URL = "https://api.billdu.com"
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024

function configuredCredentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.BILLDU_API_KEY?.trim() ?? ""
  const apiSecret = process.env.BILLDU_API_SECRET?.trim() ?? ""
  if (!apiKey || !apiSecret) throw new Error("BILLDU_NOT_CONFIGURED")
  return { apiKey, apiSecret }
}

function sortedPayload(data: Record<string, unknown>, apiKey: string, timestamp: number): string {
  const payload = { ...data, apiKey, timestamp }
  return JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map(key => [key, payload[key]])))
}

export async function createBillduSignature(
  data: Record<string, unknown>,
  apiKey: string,
  apiSecret: string,
  timestamp: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sortedPayload(data, apiKey, timestamp)))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

async function billduRequest(path: string, query: Record<string, string | number> = {}): Promise<Response> {
  if (!path.startsWith("/") || path.includes("..")) throw new Error("INVALID_BILLDU_PATH")
  const { apiKey, apiSecret } = configuredCredentials()
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await createBillduSignature({}, apiKey, apiSecret, timestamp)
  const url = new URL(path, BILLDU_API_BASE_URL)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  url.searchParams.set("apiKey", apiKey)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("signature", signature)
  return fetch(url, { method: "GET", headers: { Accept: "application/json, application/pdf" } })
}

export async function listBillduDocuments(page: number, limit: number): Promise<unknown> {
  const response = await billduRequest("/documents", { page, limit })
  if (!response.ok) {
    console.error("[Billdu] Document list failed", { status: response.status })
    throw new Error("BILLDU_LIST_FAILED")
  }
  return await response.json()
}

export async function downloadBillduDocument(id: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error("INVALID_BILLDU_DOCUMENT_ID")
  const response = await billduRequest(`/documents/${encodeURIComponent(id)}/download`)
  if (!response.ok) {
    console.error("[Billdu] Document download failed", { status: response.status })
    throw new Error("BILLDU_DOWNLOAD_FAILED")
  }
  const length = Number(response.headers.get("content-length") ?? 0)
  if (length > MAX_DOWNLOAD_BYTES) throw new Error("BILLDU_DOCUMENT_TOO_LARGE")
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("BILLDU_DOCUMENT_TOO_LARGE")
  return { bytes, contentType: response.headers.get("content-type") || "application/pdf" }
}
