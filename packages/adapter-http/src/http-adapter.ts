/**
 * HTTP-backed ApiAdapter for travisEATSbugs.
 *
 * Points the widget at any backend that exposes the v0.2 REST contract
 * (documented in adapter-cloudflare's worker, when that lands). The
 * adapter is intentionally thin: it serializes the ApiAdapter methods
 * onto REST endpoints, parses the JSON, and returns Annotation objects.
 * No retries, no caching, no auth flow. Consumers wrap or compose
 * around it as needed.
 *
 * REST contract (subject to versioning under `/v1/`):
 *   GET    /annotations?path=&surfaceId=&state=     → Annotation[]
 *   POST   /annotations                              → Annotation
 *   PATCH  /annotations/:id                          → Annotation
 *   DELETE /annotations/:id                          → 204
 *   GET    /authors                                  → AuthorRef[]
 *
 * Headers: 'Content-Type: application/json' for POST/PATCH. If
 * `authHeader` is provided, it's attached to every request as
 * `Authorization: <value>`. Other headers can be injected via
 * `headers`.
 */

import type {
  Annotation,
  ApiAdapter,
  AuthorRef,
  CreateInput,
  ListQuery,
  UpdatePatch,
} from '@travisbreaks/travisEATSbugs'

export type HttpAdapterOptions = {
  /** Backend base URL, e.g. `https://eats.travisfixes.com/v1`. */
  baseUrl: string
  /** Optional fetch override (testing or polyfill). Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch
  /** Optional Authorization header value (e.g. `Bearer <token>`). */
  authHeader?: string
  /** Additional headers attached to every request. */
  headers?: Record<string, string>
}

export class HttpAdapter implements ApiAdapter {
  private baseUrl: string
  private fetcher: typeof globalThis.fetch
  private extraHeaders: Record<string, string>

  constructor(opts: HttpAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.extraHeaders = { ...(opts.headers ?? {}) }
    if (opts.authHeader) {
      this.extraHeaders.Authorization = opts.authHeader
    }
  }

  async list(query: ListQuery = {}): Promise<Annotation[]> {
    const params = new URLSearchParams()
    if (query.anchor) {
      if (query.anchor.mode === 'route') {
        params.set('mode', 'route')
        if (query.anchor.path) params.set('path', query.anchor.path)
      } else if (query.anchor.mode === 'spatial') {
        params.set('mode', 'spatial')
        if (query.anchor.surfaceId) params.set('surfaceId', query.anchor.surfaceId)
      }
    }
    if (query.state && query.state !== 'all') {
      params.set('state', query.state)
    }
    const qs = params.toString()
    const url = `${this.baseUrl}/annotations${qs ? `?${qs}` : ''}`
    const res = await this.fetcher(url, {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      throw new Error(`HttpAdapter list: ${res.status} ${res.statusText}`)
    }
    const body = await res.json()
    return Array.isArray(body) ? (body as Annotation[]) : []
  }

  async create(input: CreateInput): Promise<Annotation> {
    const res = await this.fetcher(`${this.baseUrl}/annotations`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(`HttpAdapter create: ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as Annotation
  }

  async update(id: string, patch: UpdatePatch): Promise<Annotation> {
    const res = await this.fetcher(`${this.baseUrl}/annotations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      throw new Error(`HttpAdapter update: ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as Annotation
  }

  async delete(id: string): Promise<void> {
    const res = await this.fetcher(`${this.baseUrl}/annotations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!res.ok && res.status !== 204) {
      throw new Error(`HttpAdapter delete: ${res.status} ${res.statusText}`)
    }
  }

  async listAuthors(): Promise<AuthorRef[]> {
    const res = await this.fetcher(`${this.baseUrl}/authors`, {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      throw new Error(`HttpAdapter listAuthors: ${res.status} ${res.statusText}`)
    }
    const body = await res.json()
    return Array.isArray(body) ? (body as AuthorRef[]) : []
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...this.extraHeaders, ...extra }
  }
}
