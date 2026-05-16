/**
 * localStorage-backed reporter identity.
 *
 * v0.2 reporter mode: hosts hand a share-link to a non-signed-in reporter
 * (a client leaving feedback). The first time the reporter opens the
 * widget, `getCurrentUser()` returns null and the drawer / overlay shows
 * a name-input prompt. After the reporter types a name and confirms,
 * `setReporterName()` writes an AuthorRef into localStorage; subsequent
 * `getCurrentUser()` calls return that ref.
 *
 * The reporter id is generated locally (`reporter-${ts}-${rand}`) so
 * mutiple reporters in the same browser are distinguishable per
 * namespace. Hosts can override the namespace per project to isolate
 * stored identities (e.g. one reporter per client site).
 */

import type { AuthAdapter } from './adapters'
import type { AuthorRef } from './types'

export type ReporterOptions = {
  /**
   * localStorage key namespace. Defaults to `travisEATSbugs.reporter`.
   * Override per project so reporters don't bleed across host sites.
   */
  namespace?: string
}

const DEFAULT_NAMESPACE = 'travisEATSbugs.reporter'

function keyFor(opts: ReporterOptions | undefined): string {
  return opts?.namespace ?? DEFAULT_NAMESPACE
}

function readStored(key: string): AuthorRef | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as AuthorRef).id !== 'string' ||
      typeof (parsed as AuthorRef).display !== 'string'
    ) {
      return null
    }
    return parsed as AuthorRef
  } catch {
    return null
  }
}

/**
 * Build an AuthAdapter that reads the current reporter from localStorage.
 * Returns null until `setReporterName` writes an identity.
 */
export function localStorageReporter(opts: ReporterOptions = {}): AuthAdapter {
  const key = keyFor(opts)
  return {
    async getCurrentUser() {
      return readStored(key)
    },
  }
}

/**
 * Persist a reporter name to localStorage and return the AuthorRef the
 * adapter will see on the next `getCurrentUser()` call. Generates a
 * stable per-browser-per-namespace id. Returns the new identity so the
 * widget can pass it to `adapter.setCurrentUser()` if the adapter
 * supports runtime identity changes.
 */
export function setReporterName(name: string, opts: ReporterOptions = {}): AuthorRef {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('setReporterName: name cannot be empty')
  const key = keyFor(opts)
  // Preserve the existing id if one exists, so a reporter editing their
  // display name doesn't get a brand-new authorship across their old
  // annotations. Only generate a new id on first set.
  const existing = readStored(key)
  const id = existing?.id ?? `reporter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ref: AuthorRef = { id, display: trimmed }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(ref))
    } catch {
      // Quota or private-browsing failure; widget still uses the ref in
      // memory for this session.
    }
  }
  return ref
}

/**
 * Clear the stored reporter identity. Useful for logout flows or test
 * teardown. The next `getCurrentUser()` returns null again.
 */
export function clearReporterName(opts: ReporterOptions = {}): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(keyFor(opts))
  } catch {
    // ignore
  }
}
