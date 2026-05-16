/**
 * Tests for the AI triage wrap helper. Exercises the create -> triage ->
 * update flow against MemoryAdapter, the failure-tolerance contract
 * (triage threw, returned null, or update rejected all leave the create
 * intact), and the httpTriage transport (response shape coercion).
 */

import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from './adapter-memory'
import { httpTriage, wrapWithTriage } from './triage'
import type { Annotation, TriageResult } from './types'

describe('wrapWithTriage', () => {
  it('writes the triage result onto the annotation after create', async () => {
    const base = new MemoryAdapter()
    const triage = vi.fn(async (a: Annotation) => ({
      severity: 'high' as const,
      category: 'a11y',
      rationale: `body=${a.body}`,
    }))
    const api = wrapWithTriage(base, triage)
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'low contrast' })
    expect(triage).toHaveBeenCalledTimes(1)
    expect(created.triage?.severity).toBe('high')
    expect(created.triage?.category).toBe('a11y')
    expect(created.triage?.triagedAt).toBeTypeOf('number')
    const list = await base.list()
    expect(list[0]?.triage?.severity).toBe('high')
  })

  it('returns the raw create when the triage function returns null', async () => {
    const base = new MemoryAdapter()
    const triage = vi.fn(async () => null)
    const api = wrapWithTriage(base, triage)
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'meh' })
    expect(triage).toHaveBeenCalledTimes(1)
    expect(created.triage).toBeUndefined()
    const list = await base.list()
    expect(list[0]?.triage).toBeUndefined()
  })

  it('swallows triage throws and still returns the created annotation', async () => {
    const base = new MemoryAdapter()
    const triage = vi.fn(async () => {
      throw new Error('upstream down')
    })
    const api = wrapWithTriage(base, triage)
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    expect(created.triage).toBeUndefined()
    expect(created.body).toBe('x')
  })

  it('preserves a caller-supplied triagedAt over the wrap default', async () => {
    const base = new MemoryAdapter()
    const result: TriageResult = {
      severity: 'low',
      category: 'copy',
      triagedAt: 1700000000000,
    }
    const api = wrapWithTriage(base, async () => result)
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    expect(created.triage?.triagedAt).toBe(1700000000000)
  })

  it('attaches the triage in-memory when the adapter update rejects', async () => {
    // Build a minimal adapter that succeeds on create and rejects on update,
    // so we can prove wrapWithTriage degrades to in-memory annotation+triage
    // without losing the row.
    const base = new MemoryAdapter()
    const adapter = {
      list: base.list.bind(base),
      create: base.create.bind(base),
      update: async () => {
        throw new Error('cannot persist triage')
      },
      delete: base.delete.bind(base),
    }
    const api = wrapWithTriage(adapter, async () => ({
      severity: 'medium' as const,
      category: 'copy',
    }))
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    expect(created.triage?.severity).toBe('medium')
    // base store still has the un-triaged row; the wrap reported the
    // in-memory enriched shape to the caller without throwing.
    const list = await base.list()
    expect(list[0]?.triage).toBeUndefined()
  })

  it('passes through list, update, delete, and listAuthors unchanged', async () => {
    const base = new MemoryAdapter()
    const api = wrapWithTriage(base, async () => null)
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    await api.update(created.id, { body: 'y' })
    const list = await api.list()
    expect(list[0]?.body).toBe('y')
    const authors = await api.listAuthors?.()
    expect(authors).toBeDefined()
    await api.delete(created.id)
    const after = await api.list()
    expect(after).toHaveLength(0)
  })
})

describe('httpTriage', () => {
  it('returns null on empty endpoint', async () => {
    const fn = httpTriage({ endpoint: '' })
    const result = await fn({ id: 'x' } as Annotation)
    expect(result).toBeNull()
  })

  it('POSTs to the endpoint and coerces a valid response', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ severity: 'high', category: 'a11y', rationale: 'why' }), {
          status: 200,
        }),
    )
    const fn = httpTriage({ endpoint: 'https://triage.example/', fetch: fakeFetch })
    const result = await fn({ id: 'x' } as Annotation)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    expect(result?.severity).toBe('high')
    expect(result?.category).toBe('a11y')
  })

  it('returns null on non-2xx', async () => {
    const fakeFetch = vi.fn(async () => new Response('nope', { status: 503 }))
    const fn = httpTriage({ endpoint: 'https://triage.example/', fetch: fakeFetch })
    const result = await fn({ id: 'x' } as Annotation)
    expect(result).toBeNull()
  })

  it('returns null on malformed body (missing required fields)', async () => {
    const fakeFetch = vi.fn(
      async () => new Response(JSON.stringify({ severity: 'sky-high' }), { status: 200 }),
    )
    const fn = httpTriage({ endpoint: 'https://triage.example/', fetch: fakeFetch })
    const result = await fn({ id: 'x' } as Annotation)
    expect(result).toBeNull()
  })

  it('forwards Authorization header when provided', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ severity: 'low', category: 'misc' }), { status: 200 }),
    )
    const fn = httpTriage({
      endpoint: 'https://triage.example/',
      fetch: fakeFetch,
      headers: { authorization: 'Bearer abc' },
    })
    await fn({ id: 'x' } as Annotation)
    const init = fakeFetch.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer abc')
  })
})
