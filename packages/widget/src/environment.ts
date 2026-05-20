/**
 * Environment metadata capture (page-mode "Additional Info" payload).
 *
 * Mirrors the BugHerd "Additional Info" panel: URL, OS, browser + version,
 * selector (the clicked element's CSS path, sourced from anchor-route), screen
 * resolution, browser window size, color depth, plus a couple of extras
 * (device pixel ratio, language, page title, referrer, viewport) that are
 * trivial to grab and useful for triage.
 *
 * Pure: no side effects, no fetches, no DOM mutation. Safe to call in any
 * browser context. Returns `null` in non-browser environments (SSR, tests)
 * so callers can treat absence the same as "host opted out".
 */

import type { Environment } from './types'

/**
 * Order matters: iOS UAs contain "Mac OS X" (e.g. iPad: "CPU OS 17_0 like
 * Mac OS X"), so iOS-specific tokens must run before the macOS pattern. Same
 * trap for Android, whose UA carries "Linux". Specific-before-generic.
 */
const KNOWN_OS = [
  { test: /iPhone|iPad|iPod/, label: 'iOS' },
  { test: /Android/, label: 'Android' },
  { test: /Windows NT 10/, label: 'Windows 10' },
  { test: /Windows NT 11/, label: 'Windows 11' },
  { test: /Windows NT/, label: 'Windows' },
  { test: /Mac OS X|Macintosh/, label: 'Mac OS' },
  { test: /CrOS/, label: 'Chrome OS' },
  { test: /Linux/, label: 'Linux' },
]

/**
 * Browser detection. Order matters: Edge / Opera / Brave UA strings all
 * contain "Chrome", so they must run before the plain Chrome check.
 */
const KNOWN_BROWSERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Edge', pattern: /Edg\/([\d.]+)/ },
  { name: 'Opera', pattern: /OPR\/([\d.]+)/ },
  { name: 'Brave', pattern: /Brave\/([\d.]+)/ },
  { name: 'Vivaldi', pattern: /Vivaldi\/([\d.]+)/ },
  { name: 'Chrome', pattern: /Chrome\/([\d.]+)/ },
  { name: 'Firefox', pattern: /Firefox\/([\d.]+)/ },
  { name: 'Safari', pattern: /Version\/([\d.]+).*Safari/ },
]

type UserAgentDataLike = {
  platform?: string
  brands?: Array<{ brand: string; version: string }>
}

export function detectOs(ua: string, navigatorPlatform?: string): string {
  // Modern UA-CH wins when available (Chrome 90+, Edge 90+).
  if (navigatorPlatform) {
    const p = navigatorPlatform.trim()
    if (p) return p
  }
  for (const candidate of KNOWN_OS) {
    if (candidate.test.test(ua)) return candidate.label
  }
  return 'Unknown'
}

export function detectBrowser(ua: string): { name: string; version: string } {
  for (const candidate of KNOWN_BROWSERS) {
    const match = candidate.pattern.exec(ua)
    if (match) {
      return { name: candidate.name, version: match[1] ?? '' }
    }
  }
  return { name: 'Unknown', version: '' }
}

/**
 * Capture the full environment snapshot. Call once at create time; the
 * payload is small (<400 bytes), so storing it per annotation is fine.
 *
 * Returns null in non-browser contexts.
 */
export function captureEnvironment(): Environment | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null
  }
  const ua = navigator.userAgent || ''
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData
  const platform = uaData?.platform ?? (navigator as Navigator & { platform?: string }).platform
  const os = detectOs(ua, platform)
  const browser = detectBrowser(ua)
  const screen = typeof window.screen !== 'undefined' ? window.screen : null
  const doc = typeof document !== 'undefined' ? document : null
  return {
    url: typeof window.location !== 'undefined' ? window.location.href : '',
    title: doc?.title ?? '',
    referrer: doc?.referrer ?? '',
    os,
    browser: browser.name,
    browserVersion: browser.version,
    userAgent: ua,
    screenW: screen?.width ?? 0,
    screenH: screen?.height ?? 0,
    windowW: typeof window.innerWidth === 'number' ? window.innerWidth : 0,
    windowH: typeof window.innerHeight === 'number' ? window.innerHeight : 0,
    colorDepth: screen?.colorDepth ?? 0,
    pixelRatio: typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
    language: navigator.language || '',
    timezone: getTimezone(),
    capturedAt: Date.now(),
  }
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}
