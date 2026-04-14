import crypto from "crypto"

/**
 * AES-256-GCM helpers for encrypting AI provider API keys at rest.
 *
 * Key comes from env `AI_ENCRYPTION_KEY` (64 hex chars = 32 bytes).
 * Payload format: base64(iv[12] || authTag[16] || ciphertext).
 *
 * Never log plaintext. Never return decrypted keys to the client — the
 * decrypt helper is only called server-side inside the chat endpoint.
 */
const ALGO = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.AI_ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      "AI_ENCRYPTION_KEY is not set. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    )
  }
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error(
      `AI_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars). Got ${key.length} bytes.`
    )
  }
  return key
}

export function encryptApiKey(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decryptApiKey(payload: string): string {
  const key = getKey()
  const buf = Buffer.from(payload, "base64")
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Encrypted API key payload is too short")
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ct = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}

export function maskApiKey(plaintext: string): string {
  // Used at PATCH time to store the display hint; never derived from ciphertext.
  if (plaintext.length <= 4) return plaintext
  return plaintext.slice(-4)
}
