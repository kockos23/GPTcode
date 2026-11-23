const OTP_DELIVERY_MAX_AGE_MS = 5 * 60 * 1000

export type OtpDeliveryEnvelope = {
  email: string
  token: string
  issuedAt: number
  nonce: string
  signature: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function payloadText(envelope: Pick<OtpDeliveryEnvelope, "email" | "token" | "issuedAt" | "nonce">): string {
  return `${envelope.email.trim().toLowerCase()}\n${envelope.token}\n${envelope.issuedAt}\n${envelope.nonce}`
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  return bytesToHex(new Uint8Array(signature))
}

export async function createOtpDeliveryEnvelope(
  email: string,
  token: string,
  secret: string,
  now = Date.now(),
): Promise<OtpDeliveryEnvelope> {
  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const envelope = {
    email: email.trim().toLowerCase(),
    token,
    issuedAt: now,
    nonce: bytesToHex(nonceBytes),
  }
  return { ...envelope, signature: await hmacHex(secret, payloadText(envelope)) }
}

export async function validateOtpDeliveryEnvelope(
  value: unknown,
  options: { secret: string; ownerEmail: string; now?: number },
): Promise<boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const envelope = value as Partial<OtpDeliveryEnvelope>
  if (
    typeof envelope.email !== "string" ||
    typeof envelope.token !== "string" ||
    typeof envelope.issuedAt !== "number" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.signature !== "string"
  ) return false
  const now = options.now ?? Date.now()
  if (envelope.email.trim().toLowerCase() !== options.ownerEmail.trim().toLowerCase()) return false
  if (!/^\d{6}$/.test(envelope.token)) return false
  if (!/^[a-f0-9]{32}$/.test(envelope.nonce) || !/^[a-f0-9]{64}$/.test(envelope.signature)) return false
  if (envelope.issuedAt > now + 30_000 || now - envelope.issuedAt > OTP_DELIVERY_MAX_AGE_MS) return false
  const expected = await hmacHex(options.secret, payloadText({
    email: envelope.email,
    token: envelope.token,
    issuedAt: envelope.issuedAt,
    nonce: envelope.nonce,
  }))
  return constantTimeEqual(envelope.signature, expected)
}
