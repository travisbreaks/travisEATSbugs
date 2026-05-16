/**
 * CloudflareAdapter tests. Uses better-sqlite3 in-memory + a D1-shaped
 * wrapper so we exercise REAL SQL semantics (constraints, indexes, JSON
 * round-trips) instead of mocking at the query level.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CloudflareAdapter } from './cloudflare-adapter'
import type { D1Like, D1PreparedStatementLike } from './types'

const MIGRATION_PATHS = [
  join(__dirname, '../migrations/001_annotations.sql'),
  join(__dirname, '../migrations/002_triage.sql'),
]

class D1Shim implements D1Like {
  constructor(public sqlite: Database.Database) {}
  prepare(query: string): D1PreparedStatementLike {
    return new D1ShimStmt(this.sqlite, query)
  }
}

class D1ShimStmt implements D1PreparedStatementLike {
  private boundArgs: unknown[] = []
  constructor(
    private sqlite: Database.Database,
    private query: string,
  ) {}
  bind(...values: unknown[]): D1PreparedStatementLike {
    this.boundArgs = values
    return this
  }
  async first<T = unknown>(): Promise<T | null> {
    const stmt = this.sqlite.prepare(this.query)
    const result = stmt.get(...(this.boundArgs as Database.SqliteParam[]))
    return (result as T) ?? null
  }
  async all<T = unknown>(): Promise<{ results?: T[] }> {
    const stmt = this.sqlite.prepare(this.query)
    const rows = stmt.all(...(this.boundArgs as Database.SqliteParam[])) as T[]
    return { results: rows }
  }
  async run(): Promise<{ success?: boolean; meta?: { changes?: number } }> {
    const stmt = this.sqlite.prepare(this.query)
    const result = stmt.run(...(this.boundArgs as Database.SqliteParam[]))
    return { success: true, meta: { changes: result.changes } }
  }
}

function makeAdapter(now = () => 1700000000000): {
  adapter: CloudflareAdapter
  sqlite: Database.Database
} {
  const sqlite = new Database(':memory:')
  for (const path of MIGRATION_PATHS) {
    sqlite.exec(readFileSync(path, 'utf8'))
  }
  const adapter = new CloudflareAdapter({
    db: new D1Shim(sqlite),
    currentUser: { id: 'tester', display: 'Tester' },
    now,
    audit: true,
  })
  return { adapter, sqlite }
}

describe('CloudflareAdapter', () => {
  let adapter: CloudflareAdapter
  let sqlite: Database.Database

  beforeEach(() => {
    const result = makeAdapter()
    adapter = result.adapter
    sqlite = result.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('create + list', () => {
    it('creates a route-anchored annotation and lists it back', async () => {
      const created = await adapter.create({
        anchor: { mode: 'route', path: '/' },
        body: 'Hero copy reads well.',
      })
      expect(created.anchor.mode).toBe('route')
      expect(created.body).toBe('Hero copy reads well.')
      expect(created.state).toBe('open')
      expect(created.author.id).toBe('tester')

      const list = await adapter.list({ anchor: { mode: 'route', path: '/' } })
      expect(list).toHaveLength(1)
      expect(list[0]?.id).toBe(created.id)
    })

    it('creates a spatial-anchored annotation with x/y and surface kind', async () => {
      const created = await adapter.create({
        anchor: {
          mode: 'spatial',
          surface: 'canvas',
          surfaceId: 'playground-canvas',
          x: 42,
          y: 58,
        },
        body: 'Crop this corner tighter.',
      })
      expect(created.anchor.mode).toBe('spatial')
      if (created.anchor.mode === 'spatial') {
        expect(created.anchor.x).toBe(42)
        expect(created.anchor.y).toBe(58)
        expect(created.anchor.surfaceId).toBe('playground-canvas')
      }
    })

    it('round-trips a route anchor with selector + xpath + text-quote + viewport', async () => {
      const created = await adapter.create({
        anchor: {
          mode: 'route',
          path: '/about',
          selector: 'h1.hero',
          xpath: '/html/body/main/h1',
          textQuote: { exact: 'Click', prefix: '', suffix: ' the bug' },
          viewport: { x: 12, y: 24, w: 200, h: 60 },
        },
        body: 'Anchor test.',
      })
      const list = await adapter.list()
      expect(list).toHaveLength(1)
      const anchor = list[0]?.anchor
      if (anchor && anchor.mode === 'route') {
        expect(anchor.selector).toBe('h1.hero')
        expect(anchor.xpath).toBe('/html/body/main/h1')
        expect(anchor.textQuote?.exact).toBe('Click')
        expect(anchor.viewport?.w).toBe(200)
      } else {
        throw new Error('anchor narrowed wrong')
      }
      expect(created.id).toBe(list[0]?.id)
    })

    it('filters by state', async () => {
      const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'one' })
      await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'two' })
      await adapter.update(a.id, { resolvedPR: 42 })
      const open = await adapter.list({ state: 'open' })
      const resolved = await adapter.list({ state: 'resolved' })
      expect(open).toHaveLength(1)
      expect(resolved).toHaveLength(1)
      expect(resolved[0]?.state).toBe('resolved')
    })
  })

  describe('update: body edit', () => {
    it('updates body and stamps modified_at', async () => {
      let ts = 1000
      const { adapter: a } = makeAdapter(() => ts)
      const created = await a.create({ anchor: { mode: 'route', path: '/' }, body: 'first' })
      ts = 2000
      const updated = await a.update(created.id, { body: 'second' })
      expect(updated.body).toBe('second')
      expect(updated.modifiedAt).toBe(2000)
      expect(updated.createdAt).toBe(1000)
    })
  })

  describe('update: resolve + reopen', () => {
    it('resolves an annotation with PR number and resolution note', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'bug' })
      const resolved = await adapter.update(created.id, {
        resolvedPR: 142,
        resolutionNote: 'shipped in v0.1',
      })
      expect(resolved.state).toBe('resolved')
      expect(resolved.resolvedPR).toBe(142)
      expect(resolved.resolutionNote).toBe('shipped in v0.1')
      expect(resolved.resolvedBy).toBe('tester')
    })

    it('reopens by clearing all resolution columns', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'bug' })
      await adapter.update(created.id, { resolvedPR: 99, resolutionNote: 'note' })
      const reopened = await adapter.update(created.id, { resolvedPR: null })
      expect(reopened.state).toBe('open')
      expect(reopened.resolvedPR).toBeUndefined()
      expect(reopened.resolutionNote).toBeUndefined()
      expect(reopened.resolvedBy).toBeUndefined()
    })
  })

  describe('update: overlap', () => {
    it('marks related ids without resolving', async () => {
      const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
      const b = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'b' })
      const updated = await adapter.update(b.id, { relatedIds: [a.id] })
      expect(updated.relatedIds).toEqual([a.id])
      expect(updated.state).toBe('open')
    })

    it('marks dup-of', async () => {
      const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
      const b = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'b' })
      const updated = await adapter.update(b.id, { dupOf: a.id })
      expect(updated.dupOf).toBe(a.id)
    })
  })

  describe('UpdatePatch discrimination', () => {
    it('rejects mixing body edit with resolution', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      // body + resolvedPR is intentionally invalid per Pivotal route.ts behavior
      await expect(
        adapter.update(created.id, {
          body: 'y',
          resolvedPR: 1,
          // biome-ignore lint/suspicious/noExplicitAny: testing illegal patch shape
        } as any),
      ).rejects.toThrow(/cannot be combined/)
    })

    it('rejects mixing reopen with overlap fields', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await adapter.update(created.id, { resolvedPR: 1 })
      await expect(
        adapter.update(created.id, {
          resolvedPR: null,
          relatedIds: ['some-id'],
          // biome-ignore lint/suspicious/noExplicitAny: testing illegal patch shape
        } as any),
      ).rejects.toThrow(/cannot carry overlap/)
    })

    it('rejects an empty patch', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await expect(
        // biome-ignore lint/suspicious/noExplicitAny: testing illegal patch shape
        adapter.update(created.id, {} as any),
      ).rejects.toThrow(/empty patch/)
    })
  })

  describe('delete', () => {
    it('deletes by id', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await adapter.delete(created.id)
      const list = await adapter.list()
      expect(list).toHaveLength(0)
    })

    it('throws on unknown id', async () => {
      await expect(adapter.delete('does-not-exist')).rejects.toThrow(/not found/)
    })
  })

  describe('listAuthors', () => {
    it('returns distinct authors from current annotations', async () => {
      await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'one' })
      // Insert a row from a different author directly so we exercise distinct.
      sqlite
        .prepare(
          `INSERT INTO annotations (id, anchor_mode, anchor_path, body, author_id, author_display, created_at, modified_at, state)
           VALUES ('seed-1', 'route', '/', 'two', 'cole', 'Cole', 1, 1, 'open')`,
        )
        .run()
      const authors = await adapter.listAuthors()
      expect(authors).toHaveLength(2)
      expect(authors.map((a) => a.id).sort()).toEqual(['cole', 'tester'])
    })
  })

  describe('audit log', () => {
    it('writes an audit row per mutation when audit: true', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await adapter.update(created.id, { body: 'y' })
      await adapter.update(created.id, { resolvedPR: 1 })
      await adapter.delete(created.id)
      const rows = sqlite
        .prepare('SELECT action FROM annotation_audit_log ORDER BY id ASC')
        .all() as Array<{ action: string }>
      expect(rows.map((r) => r.action)).toEqual(['create', 'body_edit', 'resolve', 'delete'])
    })
  })

  describe('triage', () => {
    it('writes a triage patch and round-trips on list', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      const triaged = await adapter.update(created.id, {
        triage: {
          severity: 'high',
          category: 'a11y',
          suggestedAssignee: 'cole',
          dupeOf: 'prior-id',
          rationale: 'contrast 2.1:1',
          triagedAt: 1700000000999,
        },
      })
      expect(triaged.triage?.severity).toBe('high')
      expect(triaged.triage?.category).toBe('a11y')
      expect(triaged.triage?.suggestedAssignee).toBe('cole')
      expect(triaged.triage?.dupeOf).toBe('prior-id')
      expect(triaged.triage?.rationale).toBe('contrast 2.1:1')
      expect(triaged.triage?.triagedAt).toBe(1700000000999)

      const list = await adapter.list()
      expect(list[0]?.triage?.severity).toBe('high')
    })

    it('rejects mixing triage with body, resolution, or overlap', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await expect(
        adapter.update(created.id, {
          triage: { severity: 'low', category: 'misc' },
          dupOf: 'some-id',
          // biome-ignore lint/suspicious/noExplicitAny: testing illegal patch shape
        } as any),
      ).rejects.toThrow(/triage patch cannot/)
    })

    it('writes a triage audit row', async () => {
      const created = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      await adapter.update(created.id, {
        triage: { severity: 'low', category: 'copy' },
      })
      const rows = sqlite
        .prepare('SELECT action FROM annotation_audit_log ORDER BY id ASC')
        .all() as Array<{ action: string }>
      expect(rows.map((r) => r.action)).toEqual(['create', 'triage'])
    })
  })
})
