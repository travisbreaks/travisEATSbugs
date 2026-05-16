/**
 * HttpAdapter tests. Mocks `fetch` with `vi.fn()` so we capture each
 * outgoing request and assert URL, method, headers, body without
 * spinning up a real server.
 */

import { describe, expect, it, vi } from 'vitest'
import { HttpAdapter } from './http-adapter'

function mockFetch(responder: (req: Request) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input.toString(), init)
    return responder(req)
  })
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('HttpAdapter', () => {
  it('list: builds URL with anchor + state params', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetcher = mockFetch((req) => {
      calls.push({ url: req.url, method: req.method })
      return jsonResponse([{ id: 'a', body: 'x' }])
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await adapter.list({ anchor: { mode: 'route', path: '/about' }, state: 'open' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toContain('/annotations?')
    expect(calls[0]?.url).toContain('mode=route')
    expect(calls[0]?.url).toContain('path=%2Fabout')
    expect(calls[0]?.url).toContain('state=open')
  })

  it('list: spatial mode encodes surfaceId', async () => {
    let captured = ''
    const fetcher = mockFetch((req) => {
      captured = req.url
      return jsonResponse([])
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await adapter.list({ anchor: { mode: 'spatial', surfaceId: 'playground-canvas' } })
    expect(captured).toContain('mode=spatial')
    expect(captured).toContain('surfaceId=playground-canvas')
  })

  it('list: returns empty array on non-array body', async () => {
    const fetcher = mockFetch(() => jsonResponse({ not: 'an array' }))
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    const result = await adapter.list()
    expect(result).toEqual([])
  })

  it('list: throws on non-2xx', async () => {
    const fetcher = mockFetch(() => new Response('', { status: 500, statusText: 'Server Error' }))
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await expect(adapter.list()).rejects.toThrow(/500/)
  })

  it('create: POST /annotations with JSON body', async () => {
    let capturedBody = ''
    let capturedHeaders: Headers | undefined
    const fetcher = mockFetch(async (req) => {
      capturedBody = await req.text()
      capturedHeaders = req.headers
      return jsonResponse({ id: 'srv-1', body: 'first', anchor: { mode: 'route', path: '/' } })
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    const result = await adapter.create({
      anchor: { mode: 'route', path: '/' },
      body: 'first',
    })
    expect(result.id).toBe('srv-1')
    const parsed = JSON.parse(capturedBody)
    expect(parsed.body).toBe('first')
    expect(parsed.anchor.mode).toBe('route')
    expect(capturedHeaders?.get('content-type')).toBe('application/json')
  })

  it('update: PATCH /annotations/:id', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []
    const fetcher = mockFetch(async (req) => {
      calls.push({ url: req.url, method: req.method, body: await req.text() })
      return jsonResponse({ id: 'srv-1', body: 'updated' })
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await adapter.update('srv-1', { body: 'updated' })
    expect(calls[0]?.method).toBe('PATCH')
    expect(calls[0]?.url).toBe('https://api.example.com/annotations/srv-1')
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ body: 'updated' })
  })

  it('update: encodes id with special characters', async () => {
    let captured = ''
    const fetcher = mockFetch((req) => {
      captured = req.url
      return jsonResponse({ id: 'a/b', body: 'x' })
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await adapter.update('a/b', { body: 'x' })
    expect(captured).toBe('https://api.example.com/annotations/a%2Fb')
  })

  it('delete: DELETE /annotations/:id, 204 is success', async () => {
    let captured = ''
    const fetcher = mockFetch((req) => {
      captured = req.method
      // 204 No Content: body must be null per the fetch spec.
      return new Response(null, { status: 204 })
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    await expect(adapter.delete('srv-1')).resolves.toBeUndefined()
    expect(captured).toBe('DELETE')
  })

  it('listAuthors: GET /authors', async () => {
    let captured = ''
    const fetcher = mockFetch((req) => {
      captured = req.url
      return jsonResponse([
        { id: 'a', display: 'Alex' },
        { id: 'b', display: 'Brie' },
      ])
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com', fetch: fetcher })
    const authors = await adapter.listAuthors()
    expect(captured).toBe('https://api.example.com/authors')
    expect(authors).toHaveLength(2)
    expect(authors[0]?.display).toBe('Alex')
  })

  it('trims trailing slash from baseUrl', async () => {
    let captured = ''
    const fetcher = mockFetch((req) => {
      captured = req.url
      return jsonResponse([])
    })
    const adapter = new HttpAdapter({ baseUrl: 'https://api.example.com/', fetch: fetcher })
    await adapter.list()
    expect(captured).toBe('https://api.example.com/annotations')
  })

  it('attaches Authorization header when authHeader option provided', async () => {
    let capturedAuth: string | null = null
    const fetcher = mockFetch((req) => {
      capturedAuth = req.headers.get('authorization')
      return jsonResponse([])
    })
    const adapter = new HttpAdapter({
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      authHeader: 'Bearer secret-token',
    })
    await adapter.list()
    expect(capturedAuth).toBe('Bearer secret-token')
  })

  it('merges extra headers per request', async () => {
    let traceId: string | null = null
    const fetcher = mockFetch((req) => {
      traceId = req.headers.get('x-trace-id')
      return jsonResponse([])
    })
    const adapter = new HttpAdapter({
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      headers: { 'X-Trace-Id': 'abc-123' },
    })
    await adapter.list()
    expect(traceId).toBe('abc-123')
  })
})
