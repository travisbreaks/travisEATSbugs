/**
 * Worker handler tests. Uses better-sqlite3 + the same D1Like shim as
 * the adapter tests, plus a fixed env, so we exercise full
 * request → response paths including auth + CORS + error handling.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { D1Like, D1PreparedStatementLike } from '@travisbreaks/travisEATSbugs-cloudflare'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type WorkerEnv, handle } from './handlers'
import { signShareToken } from './share-token'

const MIGRATION_PATHS = [
  join(__dirname, '../../../packages/adapter-cloudflare/migrations/001_annotations.sql'),
  join(__dirname, '../../../packages/adapter-cloudflare/migrations/002_triage.sql'),
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
    const r = stmt.run(...(this.boundArgs as Database.SqliteParam[]))
    return { success: true, meta: { changes: r.changes } }
  }
}

const SECRET = 'test-secret-for-handlers'

function makeEnv(sqlite: Database.Database, overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: new D1Shim(sqlite),
    MEMBER_TOKENS: 'member-token-aaaaaaaa,member-token-bbbbbbbb',
    ALLOWED_ORIGINS: '',
    SHARE_TOKEN_SECRET: SECRET,
    ...overrides,
  }
}

function makeReq(
  method: string,
  path: string,
  init: { body?: unknown; authToken?: string; origin?: string } = {},
): Request {
  const headers: Record<string, string> = {}
  if (init.authToken) headers.authorization = `Bearer ${init.authToken}`
  if (init.origin) headers.origin = init.origin
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return new Request(`https://eats.travisfixes.com${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
  })
}

describe('worker handlers', () => {
  let sqlite: Database.Database
  let env: WorkerEnv

  beforeEach(() => {
    sqlite = new Database(':memory:')
    for (const path of MIGRATION_PATHS) {
      sqlite.exec(readFileSync(path, 'utf8'))
    }
    env = makeEnv(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await handle(makeReq('GET', '/annotations'), env)
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('unauthorized')
    })

    it('rejects an unknown Bearer token', async () => {
      const res = await handle(
        makeReq('GET', '/annotations', { authToken: 'not-a-real-token' }),
        env,
      )
      expect(res.status).toBe(401)
    })

    it('accepts a recognized member token', async () => {
      const res = await handle(
        makeReq('GET', '/annotations', { authToken: 'member-token-aaaaaaaa' }),
        env,
      )
      expect(res.status).toBe(200)
    })

    it('accepts a valid share-link token', async () => {
      const token = await signShareToken(
        {
          projectId: 'demo',
          reporterId: 'reporter-1',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      )
      const res = await handle(makeReq('GET', '/annotations', { authToken: token }), env)
      expect(res.status).toBe(200)
    })

    it('rejects an expired share-link token', async () => {
      const token = await signShareToken(
        {
          projectId: 'demo',
          reporterId: 'reporter-1',
          expiresAt: Math.floor(Date.now() / 1000) - 1,
        },
        SECRET,
      )
      const res = await handle(makeReq('GET', '/annotations', { authToken: token }), env)
      expect(res.status).toBe(401)
    })
  })

  describe('REST contract', () => {
    const memberToken = 'member-token-aaaaaaaa'

    it('GET /annotations returns []', async () => {
      const res = await handle(makeReq('GET', '/annotations', { authToken: memberToken }), env)
      expect(res.status).toBe(200)
      const body = (await res.json()) as unknown[]
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(0)
    })

    it('POST then GET round-trips an annotation', async () => {
      const createRes = await handle(
        makeReq('POST', '/annotations', {
          authToken: memberToken,
          body: { anchor: { mode: 'route', path: '/' }, body: 'hello' },
        }),
        env,
      )
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { id: string; body: string }
      expect(created.body).toBe('hello')

      const listRes = await handle(
        makeReq('GET', '/annotations?mode=route&path=%2F', { authToken: memberToken }),
        env,
      )
      const list = (await listRes.json()) as Array<{ id: string }>
      expect(list).toHaveLength(1)
      expect(list[0]?.id).toBe(created.id)
    })

    it('PATCH updates body', async () => {
      const createRes = await handle(
        makeReq('POST', '/annotations', {
          authToken: memberToken,
          body: { anchor: { mode: 'route', path: '/' }, body: 'first' },
        }),
        env,
      )
      const created = (await createRes.json()) as { id: string }
      const patchRes = await handle(
        makeReq('PATCH', `/annotations/${created.id}`, {
          authToken: memberToken,
          body: { body: 'second' },
        }),
        env,
      )
      expect(patchRes.status).toBe(200)
      const updated = (await patchRes.json()) as { body: string }
      expect(updated.body).toBe('second')
    })

    it('PATCH with mixed body+resolution returns 400', async () => {
      const createRes = await handle(
        makeReq('POST', '/annotations', {
          authToken: memberToken,
          body: { anchor: { mode: 'route', path: '/' }, body: 'x' },
        }),
        env,
      )
      const created = (await createRes.json()) as { id: string }
      const patchRes = await handle(
        makeReq('PATCH', `/annotations/${created.id}`, {
          authToken: memberToken,
          body: { body: 'y', resolvedPR: 1 },
        }),
        env,
      )
      expect(patchRes.status).toBe(400)
    })

    it('DELETE returns 204', async () => {
      const createRes = await handle(
        makeReq('POST', '/annotations', {
          authToken: memberToken,
          body: { anchor: { mode: 'route', path: '/' }, body: 'x' },
        }),
        env,
      )
      const created = (await createRes.json()) as { id: string }
      const delRes = await handle(
        makeReq('DELETE', `/annotations/${created.id}`, { authToken: memberToken }),
        env,
      )
      expect(delRes.status).toBe(204)
    })

    it('DELETE on missing id returns 404', async () => {
      const res = await handle(
        makeReq('DELETE', '/annotations/does-not-exist', { authToken: memberToken }),
        env,
      )
      expect(res.status).toBe(404)
    })

    it('GET /authors returns distinct authors', async () => {
      await handle(
        makeReq('POST', '/annotations', {
          authToken: memberToken,
          body: { anchor: { mode: 'route', path: '/' }, body: 'a' },
        }),
        env,
      )
      const res = await handle(makeReq('GET', '/authors', { authToken: memberToken }), env)
      expect(res.status).toBe(200)
      const authors = (await res.json()) as Array<{ id: string }>
      expect(authors.length).toBeGreaterThanOrEqual(1)
    })

    it('unknown route returns 404', async () => {
      const res = await handle(makeReq('GET', '/nope', { authToken: memberToken }), env)
      expect(res.status).toBe(404)
    })
  })

  describe('CORS', () => {
    it('OPTIONS returns 204 with CORS headers when origin allowed', async () => {
      const corsEnv = makeEnv(sqlite, { ALLOWED_ORIGINS: 'https://app.example.com' })
      const res = await handle(
        makeReq('OPTIONS', '/annotations', { origin: 'https://app.example.com' }),
        corsEnv,
      )
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
      expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    })

    it('omits allow-origin when origin not in list', async () => {
      const corsEnv = makeEnv(sqlite, { ALLOWED_ORIGINS: 'https://app.example.com' })
      const res = await handle(
        makeReq('OPTIONS', '/annotations', { origin: 'https://other.com' }),
        corsEnv,
      )
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    })

    it('with empty ALLOWED_ORIGINS, allows any origin (dev mode)', async () => {
      const res = await handle(
        makeReq('OPTIONS', '/annotations', { origin: 'https://anything.com' }),
        env,
      )
      expect(res.headers.get('access-control-allow-origin')).toBe('https://anything.com')
    })
  })

  describe('reporter mode (share token)', () => {
    it('reporter identity is reflected in the created annotation author', async () => {
      const token = await signShareToken(
        {
          projectId: 'demo',
          reporterId: 'reporter-xyz',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      )
      const createRes = await handle(
        makeReq('POST', '/annotations', {
          authToken: token,
          body: { anchor: { mode: 'route', path: '/' }, body: 'reporter note' },
        }),
        env,
      )
      const created = (await createRes.json()) as { author: { id: string; display: string } }
      expect(created.author.id).toBe('reporter-xyz')
      expect(created.author.display).toContain('Reporter')
    })
  })

  describe('POST /triage', () => {
    const memberToken = 'member-token-aaaaaaaa'

    it('returns 503 when ANTHROPIC_API_KEY is unset', async () => {
      const res = await handle(
        makeReq('POST', '/triage', {
          authToken: memberToken,
          body: { annotation: { id: 'a', body: 'x' } },
        }),
        env,
      )
      expect(res.status).toBe(503)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('triage_not_configured')
    })

    it('returns 403 for share-link (reporter) tokens', async () => {
      const reporterToken = await signShareToken(
        {
          projectId: 'demo',
          reporterId: 'reporter-y',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      )
      const configured = makeEnv(sqlite, {
        ANTHROPIC_API_KEY: 'sk-test',
        TRIAGE_FN: async () => ({ severity: 'low', category: 'misc', rationale: 'r' }),
      })
      const res = await handle(
        makeReq('POST', '/triage', {
          authToken: reporterToken,
          body: { annotation: { id: 'a', body: 'x' } },
        }),
        configured,
      )
      expect(res.status).toBe(403)
    })

    it('returns the structured triage result when the upstream call succeeds', async () => {
      const stub = async () => ({
        severity: 'high' as const,
        category: 'a11y',
        rationale: 'contrast issue',
        suggestedAssignee: 'cole',
      })
      const configured = makeEnv(sqlite, {
        ANTHROPIC_API_KEY: 'sk-test',
        TRIAGE_FN: stub,
      })
      const res = await handle(
        makeReq('POST', '/triage', {
          authToken: memberToken,
          body: { annotation: { id: 'a', body: 'contrast is too low' } },
        }),
        configured,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        severity: string
        category: string
        suggestedAssignee?: string
      }
      expect(body.severity).toBe('high')
      expect(body.category).toBe('a11y')
      expect(body.suggestedAssignee).toBe('cole')
    })

    it('returns 502 when the upstream call returns null', async () => {
      const configured = makeEnv(sqlite, {
        ANTHROPIC_API_KEY: 'sk-test',
        TRIAGE_FN: async () => null,
      })
      const res = await handle(
        makeReq('POST', '/triage', {
          authToken: memberToken,
          body: { annotation: { id: 'a', body: 'x' } },
        }),
        configured,
      )
      expect(res.status).toBe(502)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('triage_upstream_failed')
    })

    it('returns 400 when the body lacks an annotation', async () => {
      const configured = makeEnv(sqlite, {
        ANTHROPIC_API_KEY: 'sk-test',
        TRIAGE_FN: async () => ({ severity: 'low', category: 'misc', rationale: 'r' }),
      })
      const res = await handle(
        makeReq('POST', '/triage', { authToken: memberToken, body: { recent: [] } }),
        configured,
      )
      expect(res.status).toBe(400)
    })
  })
})
