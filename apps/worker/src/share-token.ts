/**
 * Share-link token primitive.
 *
 * Reporters (clients leaving annotations) don't sign up. The host app
 * hands them a share URL containing an HMAC-signed token that scopes
 * them to a specific project + reporter identity for a bounded window.
 * The worker verifies the token on every request that doesn't carry a
 * member token.
 *
 * Token shape: `<base64url(payload)>.<base64url(signature)>`
 *   payload = JSON: { projectId, reporterId, expiresAt }  (seconds)
 *   signature = HMAC-SHA256(payload, secret)
 *
 * Web Crypto only (works in Workers, browsers, Node 19+). No Node-only
 * imports here.
 */

export type SharePayload = {
  projectId: string
  /** Stable id for the reporter (e.g. "anon-${nanoid}" stored client-side). */
  reporterId: string
  /** Unix seconds. Token is invalid at or after this time. */
  expiresAt: number
}

export type VerifyResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'bad_payload' }

const enc = new TextEncoder()
const dec = new TextDecoder()

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
  const b64 = (s + '='.repeat(pad)).replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function signShareToken(payload: SharePayload, secret: string): Promise<string> {
  if (!secret) throw new Error('signShareToken: empty secret')
  const key = await importKey(secret)
  const payloadBytes = enc.encode(JSON.stringify(payload))
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes))
  return `${toBase64Url(payloadBytes)}.${toBase64Url(sigBytes)}`
}

/**
 * Verify a share-link token. Returns the payload on success. Constant-time
 * comparison via crypto.subtle.verify avoids string-equality timing leaks.
 *
 * The `now` argument exists so tests can pin time deterministically.
 */
export async function verifyShareToken(
  token: string,
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'malformed' }
  }
  const [payloadPart, sigPart] = token.split('.')
  if (!payloadPart || !sigPart) {
    return { ok: false, reason: 'malformed' }
  }
  let payloadBytes: Uint8Array
  let sigBytes: Uint8Array
  try {
    payloadBytes = fromBase64Url(payloadPart)
    sigBytes = fromBase64Url(sigPart)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const key = await importKey(secret)
  // Cast: Node 22's lib.dom types want `BufferSource` here. Both args are
  // Uint8Array with ArrayBuffer-backed storage at runtime; the cast just
  // satisfies the stricter generic signature.
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as BufferSource,
    payloadBytes as BufferSource,
  )
  if (!valid) {
    return { ok: false, reason: 'bad_signature' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(dec.decode(payloadBytes))
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SharePayload).projectId !== 'string' ||
    typeof (parsed as SharePayload).reporterId !== 'string' ||
    typeof (parsed as SharePayload).expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'bad_payload' }
  }
  const payload = parsed as SharePayload
  if (payload.expiresAt <= now()) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, payload }
}
