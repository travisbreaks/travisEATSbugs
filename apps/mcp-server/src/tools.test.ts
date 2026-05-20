/**
 * Smoke tests for the MCP tool handlers.
 *
 * Uses MemoryAdapter (in-process, no network) to verify the handlers
 * delegate correctly to the ApiAdapter contract and return the
 * expected MCP CallToolResult shape (array of `{ type: 'text', text }`
 * items containing JSON).
 */

import { MemoryAdapter } from '@travisbreaks/travisEATSbugs'
import type { Annotation } from '@travisbreaks/travisEATSbugs'
import { beforeEach, describe, expect, it } from 'vitest'
import { TOOL_DEFS, handlers } from './tools'

describe('MCP tool definitions', () => {
  it('declares the initial four tools', () => {
    const names = TOOL_DEFS.map((t) => t.name).sort()
    expect(names).toEqual([
      'get_annotation',
      'list_annotations',
      'reopen_annotation',
      'resolve_annotation',
    ])
  })

  it('every tool input schema is closed (additionalProperties: false)', () => {
    for (const tool of TOOL_DEFS) {
      expect(tool.inputSchema.additionalProperties).toBe(false)
    }
  })

  it('resolve_annotation requires id + resolvedPR', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'resolve_annotation')
    expect(tool?.inputSchema.required).toEqual(['id', 'resolvedPR'])
  })

  it('list_annotations has no required fields (both filters optional)', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'list_annotations')
    expect(tool?.inputSchema.required).toBeUndefined()
  })
})

describe('handlers.list_annotations', () => {
  let api: MemoryAdapter

  beforeEach(async () => {
    api = new MemoryAdapter()
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'one' })
    await api.create({ anchor: { mode: 'route', path: '/bookings/1' }, body: 'two' })
  })

  it('with no args returns all annotations as JSON text', async () => {
    const result = await handlers.list_annotations(api, {})
    expect(result.content).toHaveLength(1)
    expect(result.content[0]?.type).toBe('text')
    const parsed = JSON.parse(result.content[0]?.text ?? '[]') as Annotation[]
    expect(parsed).toHaveLength(2)
  })

  it('filters by path', async () => {
    const result = await handlers.list_annotations(api, { path: '/bookings/1' })
    const parsed = JSON.parse(result.content[0]?.text ?? '[]') as Annotation[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.body).toBe('two')
  })

  it('filters by state', async () => {
    const created = JSON.parse(
      (await handlers.list_annotations(api, {})).content[0]?.text ?? '[]',
    ) as Annotation[]
    const id = created[0]?.id ?? ''
    await api.update(id, { resolvedPR: 42 })
    const open = JSON.parse(
      (await handlers.list_annotations(api, { state: 'open' })).content[0]?.text ?? '[]',
    ) as Annotation[]
    const resolved = JSON.parse(
      (await handlers.list_annotations(api, { state: 'resolved' })).content[0]?.text ?? '[]',
    ) as Annotation[]
    expect(open).toHaveLength(1)
    expect(resolved).toHaveLength(1)
  })
})

describe('handlers.get_annotation', () => {
  it('returns the matching annotation by id', async () => {
    const api = new MemoryAdapter()
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'hello' })
    const result = await handlers.get_annotation(api, { id: created.id })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as Annotation
    expect(parsed.id).toBe(created.id)
    expect(parsed.body).toBe('hello')
  })

  it('throws when the id does not exist', async () => {
    const api = new MemoryAdapter()
    await expect(handlers.get_annotation(api, { id: 'never-existed' })).rejects.toThrow(/not found/)
  })
})

describe('handlers.resolve_annotation', () => {
  it('sets resolvedPR + resolutionNote', async () => {
    const api = new MemoryAdapter()
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'fix me' })
    const result = await handlers.resolve_annotation(api, {
      id: created.id,
      resolvedPR: 123,
      resolutionNote: 'shipped in v0.0.10',
    })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as Annotation
    expect(parsed.state).toBe('resolved')
    expect(parsed.resolvedPR).toBe(123)
    expect(parsed.resolutionNote).toBe('shipped in v0.0.10')
  })

  it('works without resolutionNote', async () => {
    const api = new MemoryAdapter()
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    const result = await handlers.resolve_annotation(api, { id: created.id, resolvedPR: 7 })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as Annotation
    expect(parsed.resolvedPR).toBe(7)
    expect(parsed.resolutionNote).toBeUndefined()
  })
})

describe('handlers.reopen_annotation', () => {
  it('clears resolution columns and flips state back to open', async () => {
    const api = new MemoryAdapter()
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    await api.update(created.id, { resolvedPR: 5 })
    const result = await handlers.reopen_annotation(api, { id: created.id })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as Annotation
    expect(parsed.state).toBe('open')
    expect(parsed.resolvedPR).toBeUndefined()
    expect(parsed.resolvedAt).toBeUndefined()
  })
})
