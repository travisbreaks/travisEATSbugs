/**
 * Route-change watcher.
 *
 * Both `AnnotationDrawer` (list scoped to current route) and
 * `AnnotationPageMode` (pins filtered by route) need to refresh when the
 * host app navigates without a full page reload. Next.js, React Router,
 * Vue Router, etc. mutate `window.history` via `pushState` /
 * `replaceState` and never fire `popstate`, so a vanilla `popstate` hook
 * misses every soft navigation.
 *
 * This module patches `history.pushState` + `replaceState` once
 * (idempotent guard) and bridges them into a single subscriber list
 * alongside the native `popstate` event. Each subscriber receives the
 * new `window.location.pathname` and is called only when the pathname
 * actually changes (so a `replaceState` that only swaps query params
 * does not retrigger).
 *
 * Reported regression (2026-05-18): pins from page A stay rendered after
 * navigating to page B. Root cause: page-mode's `refresh()` is called
 * only on mount; navigating between routes doesn't re-call it, so the
 * client-side filter never re-runs against the new pathname. Same shape
 * applies to the drawer's list. This fix wires both into a shared
 * route-change subscription.
 */

type Cb = (path: string) => void

let subscribers: Cb[] = []
let patched = false
let lastPath: string | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null

function currentPath(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname || '/'
}

function notify(): void {
  const path = currentPath()
  if (path === lastPath) return
  lastPath = path
  // Iterate over a copy so a subscriber that unsubscribes itself
  // mid-notify doesn't shift the array under us.
  const snapshot = subscribers.slice()
  for (const s of snapshot) {
    try {
      s(path)
    } catch {
      // Subscribers must not be able to break the notify loop.
    }
  }
}

function patchOnce(): void {
  if (patched) return
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  patched = true
  lastPath = currentPath()

  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void => {
    origPush(data, unused, url)
    notify()
  }
  history.replaceState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void => {
    origReplace(data, unused, url)
    notify()
  }
  window.addEventListener('popstate', notify)

  // Belt-and-suspenders: some frameworks (older Next, hash routers) emit
  // navigation events through non-standard channels. A 500ms poll on
  // pathname catches anything our patch missed without measurable cost.
  // Subscribers only fire when path actually changes; the poll is just
  // the trigger.
  timerInterval = setInterval(notify, 500)
}

/**
 * Subscribe to route changes. Returns an unsubscribe function. Calling
 * multiple times from the same caller is safe but redundant; one
 * subscription per consumer is the intended pattern.
 *
 * Safe to call in SSR contexts: the no-window guard short-circuits and
 * the returned unsubscribe is a no-op.
 */
export function onRouteChange(cb: Cb): () => void {
  if (typeof window === 'undefined') return () => {}
  patchOnce()
  subscribers.push(cb)
  return () => {
    subscribers = subscribers.filter((s) => s !== cb)
  }
}

/**
 * Reset module state. Test-only.
 * @internal
 */
export function __resetForTest(): void {
  subscribers = []
  patched = false
  lastPath = null
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}
