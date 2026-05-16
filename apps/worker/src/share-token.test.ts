import { describe, expect, it } from 'vitest'
import { signShareToken, verifyShareToken } from './share-token'

const SECRET = 'test-secret-do-not-use-in-prod'
const FUTURE = Math.floor(Date.now() / 1000) + 3600
const PAST = Math.floor(Date.now() / 1000) - 3600

describe('signShareToken', () => {
  it('produces a payload.signature shape', async () => {
    const token = await signShareToken(
      { projectId: 'p1', reporterId: 'r1', expiresAt: FUTURE },
      SECRET,
    )
    expect(token).toContain('.')
    const [payload, sig] = token.split('.')
    expect(payload?.length ?? 0).toBeGreaterThan(0)
    expect(sig?.length ?? 0).toBeGreaterThan(0)
  })

  it('throws on empty secret', async () => {
    await expect(
      signShareToken({ projectId: 'p', reporterId: 'r', expiresAt: FUTURE }, ''),
    ).rejects.toThrow(/empty secret/)
  })

  it('produces different signatures for different payloads', async () => {
    const a = await signShareToken({ projectId: 'p1', reporterId: 'r1', expiresAt: FUTURE }, SECRET)
    const b = await signShareToken({ projectId: 'p2', reporterId: 'r1', expiresAt: FUTURE }, SECRET)
    expect(a).not.toBe(b)
  })
})

describe('verifyShareToken', () => {
  it('verifies a freshly signed token', async () => {
    const token = await signShareToken(
      { projectId: 'p1', reporterId: 'r1', expiresAt: FUTURE },
      SECRET,
    )
    const result = await verifyShareToken(token, SECRET)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.projectId).toBe('p1')
      expect(result.payload.reporterId).toBe('r1')
    }
  })

  it('rejects empty / non-string input as malformed', async () => {
    const a = await verifyShareToken('', SECRET)
    expect(a).toEqual({ ok: false, reason: 'malformed' })
    const b = await verifyShareToken('no-dot-here', SECRET)
    expect(b).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects malformed base64', async () => {
    const result = await verifyShareToken('!!.??', SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(['malformed', 'bad_signature', 'bad_payload']).toContain(result.reason)
    }
  })

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const token = await signShareToken(
      { projectId: 'p1', reporterId: 'r1', expiresAt: FUTURE },
      SECRET,
    )
    const [payload, sig] = token.split('.')
    // Swap the payload portion (different project id) but keep the old sig.
    const fakePayload = btoa(
      JSON.stringify({ projectId: 'p2', reporterId: 'r1', expiresAt: FUTURE }),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
    const tampered = `${fakePayload}.${sig}`
    const result = await verifyShareToken(tampered, SECRET)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
    expect(payload).not.toBe(fakePayload)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signShareToken(
      { projectId: 'p1', reporterId: 'r1', expiresAt: FUTURE },
      SECRET,
    )
    const result = await verifyShareToken(token, 'different-secret')
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects an expired token', async () => {
    const token = await signShareToken(
      { projectId: 'p1', reporterId: 'r1', expiresAt: PAST },
      SECRET,
    )
    const result = await verifyShareToken(token, SECRET)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a token at the edge of expiry with pinned now()', async () => {
    const expiresAt = 10_000
    const token = await signShareToken({ projectId: 'p1', reporterId: 'r1', expiresAt }, SECRET)
    // now() = 9999 (1s before expiry) → valid
    const before = await verifyShareToken(token, SECRET, () => 9999)
    expect(before.ok).toBe(true)
    // now() = 10000 (exactly at expiry) → expired (strict <=)
    const at = await verifyShareToken(token, SECRET, () => 10000)
    expect(at).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a token with a non-object payload after decoding', async () => {
    // Sign "null" as the payload, attach a real sig, verify reports bad_payload.
    const enc = new TextEncoder()
    const payloadBytes = enc.encode('null')
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes))
    const toB64 = (b: Uint8Array) => {
      let s = ''
      for (const x of b) s += String.fromCharCode(x)
      return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    }
    const token = `${toB64(payloadBytes)}.${toB64(sig)}`
    const result = await verifyShareToken(token, SECRET)
    expect(result).toEqual({ ok: false, reason: 'bad_payload' })
  })
})
