import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { captureEnvironment, detectBrowser, detectOs } from './environment'

describe('detectOs', () => {
  it('detects Mac OS from the standard Safari UA', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(detectOs(ua)).toBe('Mac OS')
  })

  it('detects Windows 10', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectOs(ua)).toBe('Windows 10')
  })

  it('detects Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectOs(ua)).toBe('Linux')
  })

  it('detects iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(detectOs(ua)).toBe('iOS')
  })

  it('detects Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    expect(detectOs(ua)).toBe('Android')
  })

  it('falls back to navigator.platform when provided', () => {
    expect(detectOs('mystery-ua', 'macOS')).toBe('macOS')
  })

  it('returns Unknown for empty input', () => {
    expect(detectOs('')).toBe('Unknown')
  })
})

describe('detectBrowser', () => {
  it('detects Chrome with version', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectBrowser(ua)).toEqual({ name: 'Chrome', version: '120.0.0.0' })
  })

  it('detects Firefox with version', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
    expect(detectBrowser(ua)).toEqual({ name: 'Firefox', version: '120.0' })
  })

  it('detects Safari with version (and only after the Edge / Opera / Chrome checks fail)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(detectBrowser(ua)).toEqual({ name: 'Safari', version: '17.0' })
  })

  it('detects Edge before Chrome (their UA contains Chrome)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    expect(detectBrowser(ua)).toEqual({ name: 'Edge', version: '120.0.0.0' })
  })

  it('detects Opera before Chrome', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0'
    expect(detectBrowser(ua)).toEqual({ name: 'Opera', version: '105.0.0.0' })
  })

  it('returns Unknown for an unrecognized UA', () => {
    expect(detectBrowser('curl/8.0.0')).toEqual({ name: 'Unknown', version: '' })
  })
})

describe('captureEnvironment', () => {
  // JSDOM provides window/navigator/document, so this exercises the real
  // capture path. We just sanity-check that the shape is complete and that
  // numeric fields are numbers, not undefined.
  it('returns a complete payload in a JSDOM context', () => {
    const env = captureEnvironment()
    if (env === null) {
      throw new Error('captureEnvironment returned null inside JSDOM')
    }
    expect(typeof env.url).toBe('string')
    expect(typeof env.os).toBe('string')
    expect(typeof env.browser).toBe('string')
    expect(typeof env.browserVersion).toBe('string')
    expect(typeof env.userAgent).toBe('string')
    expect(typeof env.screenW).toBe('number')
    expect(typeof env.screenH).toBe('number')
    expect(typeof env.windowW).toBe('number')
    expect(typeof env.windowH).toBe('number')
    expect(typeof env.colorDepth).toBe('number')
    expect(typeof env.pixelRatio).toBe('number')
    expect(typeof env.language).toBe('string')
    expect(typeof env.timezone).toBe('string')
    expect(env.capturedAt).toBeGreaterThan(0)
  })

  it('returns null in non-browser contexts', () => {
    // Simulate SSR: stash window globally, blank it out, restore.
    const savedWindow = globalThis.window
    // @ts-expect-error: test-only delete
    delete (globalThis as { window?: unknown }).window
    const env = captureEnvironment()
    expect(env).toBe(null)
    ;(globalThis as { window?: unknown }).window = savedWindow
  })
})

describe('integration: real-world UA fingerprints', () => {
  type Fixture = { name: string; ua: string; os: string; browser: string }
  const fixtures: Fixture[] = [
    {
      name: 'Mac Chrome 120',
      ua:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.71 Safari/537.36',
      os: 'Mac OS',
      browser: 'Chrome',
    },
    {
      name: 'Win 11 Edge 120',
      ua:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      os: 'Windows 10',
      browser: 'Edge',
    },
    {
      name: 'iPad Safari 17',
      ua:
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      os: 'iOS',
      browser: 'Safari',
    },
  ]
  for (const f of fixtures) {
    it(f.name, () => {
      expect(detectOs(f.ua)).toBe(f.os)
      expect(detectBrowser(f.ua).name).toBe(f.browser)
    })
  }
})
