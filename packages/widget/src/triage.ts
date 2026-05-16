/**
 * AI triage onCreate hook (v0.5).
 *
 * Mirrors the `wrapWithAudit` / `wrapWithScreenshot` adapter-wrap pattern:
 * the host provides a `TriageFn` (typically `httpTriage({ endpoint })`
 * pointing at the worker's POST /triage route), and `wrapWithTriage`
 * arranges the call order so every successful `create` is followed by a
 * structured triage pass and a follow-up `update` writing the result
 * back onto the annotation.
 *
 * Failure modes are non-fatal: a triage that throws, times out, or
 * returns null leaves the created annotation untouched. The reporter
 * still sees a saved bug; the triage column just stays empty. This
 * matches the reporter-mode deferral pattern: opt-in, non-blocking,
 * never the reason a create fails.
 */

import type { ApiAdapter } from './adapters'
import type { Annotation, CreateInput, TriageResult, UpdatePatch } from './types'

export type TriageFn = (annotation: Annotation) => Promise<TriageResult | null>

/**
 * Wrap an ApiAdapter so every successful `create` triggers an async
 * triage pass. The wrap is fire-and-await: the wrapped `create` resolves
 * with the post-triage annotation when triage succeeds, or the raw
 * created annotation when triage returns null / throws. Either way the
 * row lands.
 *
 * Composes cleanly with `wrapWithScreenshot` and `wrapWithAudit`: order
 * is up to the caller; the widget facade applies them as
 * `screenshot -> triage -> audit` so the audit hook observes both the
 * initial create and the triage-driven update.
 */
export function wrapWithTriage(api: ApiAdapter, triage: TriageFn): ApiAdapter {
  const wrapped: ApiAdapter = {
    list: (q) => api.list(q),
    create: async (input: CreateInput) => {
      const created = await api.create(input)
      let result: TriageResult | null = null
      try {
        result = await triage(created)
      } catch {
        // Triage threw: degrade gracefully. The annotation is already
        // persisted; surfacing the error would punish the reporter for
        // a backend hiccup.
        return created
      }
      if (!result) return created
      const stamped: TriageResult = result.triagedAt ? result : { ...result, triagedAt: Date.now() }
      const patch: UpdatePatch = { triage: stamped }
      try {
        return await api.update(created.id, patch)
      } catch {
        // Update failed (e.g. adapter doesn't know about triage yet):
        // attach the triage in-memory so callers see it on the returned
        // shape even if it didn't persist.
        return { ...created, triage: stamped }
      }
    },
    update: (id, patch) => api.update(id, patch),
    delete: (id) => api.delete(id),
  }
  if (api.listAuthors) {
    const fn = api.listAuthors.bind(api)
    wrapped.listAuthors = fn
  }
  return wrapped
}

export type HttpTriageOptions = {
  /** Full URL of the worker route, e.g. `https://eats.travisfixes.com/triage`. */
  endpoint: string
  /** Extra request headers (commonly `authorization: Bearer <token>`). */
  headers?: Record<string, string>
  /** Optional fetch override for tests / non-browser environments. */
  fetch?: typeof fetch
  /** Abort the call after this many ms. Default 8000. Triage is meant to
   * be best-effort; we don't want a slow Claude call to block the inbox.
   */
  timeoutMs?: number
}

/**
 * Default `TriageFn` factory that POSTs the annotation to a worker
 * route and expects a JSON `TriageResult` back. The endpoint is
 * responsible for calling the AI model with structured output; this
 * function only owns transport, timeout, and shape validation.
 *
 * Returns null on any non-2xx response, network error, or malformed
 * body. The wrap is built to tolerate null cleanly, so a misconfigured
 * triage endpoint silently no-ops instead of poisoning every create.
 */
export function httpTriage(opts: HttpTriageOptions): TriageFn {
  const { endpoint, headers = {}, fetch: fetchImpl, timeoutMs = 8000 } = opts
  const doFetch: typeof fetch =
    fetchImpl ??
    (typeof fetch !== 'undefined'
      ? fetch.bind(globalThis)
      : ((() => Promise.reject(new Error('no fetch'))) as typeof fetch))
  return async (annotation: Annotation) => {
    if (!endpoint) return null
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl
      ? setTimeout(() => {
          ctrl.abort()
        }, timeoutMs)
      : null
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ annotation }),
        signal: ctrl?.signal,
      })
      if (!res.ok) return null
      const parsed = (await res.json()) as unknown
      return coerceTriageResult(parsed)
    } catch {
      return null
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

/**
 * Defensive shape coercion: the wire format is a TriageResult, but a
 * misbehaving / outdated worker could send anything. Drop unknown
 * fields, reject if severity / category aren't present + well-typed.
 */
function coerceTriageResult(value: unknown): TriageResult | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const sev = v.severity
  if (sev !== 'low' && sev !== 'medium' && sev !== 'high') return null
  if (typeof v.category !== 'string' || v.category.length === 0) return null
  const out: TriageResult = { severity: sev, category: v.category }
  if (typeof v.suggestedAssignee === 'string') out.suggestedAssignee = v.suggestedAssignee
  if (typeof v.dupeOf === 'string') out.dupeOf = v.dupeOf
  if (typeof v.rationale === 'string') out.rationale = v.rationale
  if (typeof v.triagedAt === 'number' && Number.isFinite(v.triagedAt)) out.triagedAt = v.triagedAt
  return out
}
