/**
 * Worker request handlers. Implements the REST contract that
 * @travisbreaks/travisEATSbugs-http expects, backed by the D1-driven
 * CloudflareAdapter.
 *
 * Auth model (v0.2):
 *   - Authorization: Bearer <token>
 *   - <token> can be a member token (from env.MEMBER_TOKENS, comma-sep)
 *     which yields full read/write as a "member" identity.
 *   - <token> can be a share-link token (HMAC-signed per share-token.ts)
 *     which yields scoped read/write as the reporter identity.
 *   - No header / unrecognized token → 401.
 *
 * v0.5 will add per-project isolation, AI triage onCreate hook, and
 * R2-backed screenshot capture.
 */

import type {
  AnchorQuery,
  Annotation,
  CreateInput,
  ListQuery,
  UpdatePatch,
} from '@travisbreaks/travisEATSbugs'
import { CloudflareAdapter, type D1Like } from '@travisbreaks/travisEATSbugs-cloudflare'
import { type TriageInvokeOpts, invokeTriage } from './anthropic'
import { verifyShareToken } from './share-token'

export type WorkerEnv = {
  DB: D1Like
  /** Comma-separated list of member tokens (full access). */
  MEMBER_TOKENS: string
  /** Comma-separated list of allowed CORS origins. Empty = allow all (dev). */
  ALLOWED_ORIGINS: string
  /** HMAC secret for share-link tokens. */
  SHARE_TOKEN_SECRET: string
  /** Anthropic API key for the AI triage onCreate route. Optional: when
   * unset, POST /triage returns 503 and the widget's httpTriage degrades
   * gracefully (the annotation create still succeeds). */
  ANTHROPIC_API_KEY?: string
  /** Optional model id override. Defaults to claude-sonnet-4-6. */
  ANTHROPIC_MODEL?: string
  /** Optional injection point so handler tests can supply a stub
   * Anthropic call. Not present in real Cloudflare bindings. */
  TRIAGE_FN?: typeof invokeTriage
}

type AuthIdentity = {
  kind: 'member' | 'reporter'
  id: string
  display: string
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export async function handle(req: Request, env: WorkerEnv): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req, env) })
  }

  const auth = await authenticate(req, env)
  if (!auth) {
    return jsonError(401, 'unauthorized', req, env)
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (path === '/annotations' && req.method === 'GET') {
      return await handleList(req, env, auth)
    }
    if (path === '/annotations' && req.method === 'POST') {
      return await handleCreate(req, env, auth)
    }
    const idMatch = /^\/annotations\/([^/]+)$/.exec(path)
    if (idMatch?.[1]) {
      const id = decodeURIComponent(idMatch[1])
      if (req.method === 'PATCH') return await handleUpdate(req, env, auth, id)
      if (req.method === 'DELETE') return await handleDelete(req, env, auth, id)
    }
    if (path === '/authors' && req.method === 'GET') {
      return await handleListAuthors(req, env, auth)
    }
    if (path === '/triage' && req.method === 'POST') {
      return await handleTriage(req, env, auth)
    }
    return jsonError(404, 'not_found', req, env)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal_error'
    if (message.includes('not found')) {
      return jsonError(404, message, req, env)
    }
    if (
      message.includes('empty patch') ||
      message.includes('cannot be combined') ||
      message.includes('cannot carry')
    ) {
      return jsonError(400, message, req, env)
    }
    return jsonError(500, message, req, env)
  }
}

function buildAdapter(env: WorkerEnv, auth: AuthIdentity): CloudflareAdapter {
  return new CloudflareAdapter({
    db: env.DB,
    currentUser: { id: auth.id, display: auth.display },
    audit: true,
  })
}

async function handleList(req: Request, env: WorkerEnv, auth: AuthIdentity): Promise<Response> {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')
  const anchor = parseAnchorQuery(mode, url)
  const state = url.searchParams.get('state') as ListQuery['state'] | null
  const adapter = buildAdapter(env, auth)
  const query: ListQuery = {}
  if (anchor) query.anchor = anchor
  if (state === 'open' || state === 'resolved' || state === 'all') query.state = state
  const result = await adapter.list(query)
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}

async function handleCreate(req: Request, env: WorkerEnv, auth: AuthIdentity): Promise<Response> {
  const body = (await req.json()) as CreateInput
  if (!body || typeof body !== 'object') {
    return jsonError(400, 'invalid_body', req, env)
  }
  const adapter = buildAdapter(env, auth)
  const created = await adapter.create(body)
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}

async function handleUpdate(
  req: Request,
  env: WorkerEnv,
  auth: AuthIdentity,
  id: string,
): Promise<Response> {
  const patch = (await req.json()) as UpdatePatch
  const adapter = buildAdapter(env, auth)
  const updated = await adapter.update(id, patch)
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}

async function handleDelete(
  req: Request,
  env: WorkerEnv,
  auth: AuthIdentity,
  id: string,
): Promise<Response> {
  const adapter = buildAdapter(env, auth)
  await adapter.delete(id)
  return new Response(null, { status: 204, headers: corsHeaders(req, env) })
}

async function handleListAuthors(
  req: Request,
  env: WorkerEnv,
  auth: AuthIdentity,
): Promise<Response> {
  const adapter = buildAdapter(env, auth)
  const authors = await adapter.listAuthors()
  return new Response(JSON.stringify(authors), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}

async function handleTriage(req: Request, env: WorkerEnv, auth: AuthIdentity): Promise<Response> {
  // Reporter-mode tokens (share links) MUST NOT trigger AI calls.
  // Triage is paid + privileged; only member tokens can invoke it.
  if (auth.kind !== 'member') {
    return jsonError(403, 'triage_member_only', req, env)
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(503, 'triage_not_configured', req, env)
  }
  const body = (await req.json()) as { annotation?: Annotation; recent?: Annotation[] }
  if (!body || typeof body !== 'object' || !body.annotation) {
    return jsonError(400, 'invalid_body', req, env)
  }
  const invokeOpts: TriageInvokeOpts = {
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_MODEL ? { model: env.ANTHROPIC_MODEL } : {}),
    ...(body.recent ? { recent: body.recent } : {}),
  }
  const invoker = env.TRIAGE_FN ?? invokeTriage
  const result = await invoker(body.annotation, invokeOpts)
  if (!result) {
    return jsonError(502, 'triage_upstream_failed', req, env)
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}

function parseAnchorQuery(mode: string | null, url: URL): AnchorQuery | undefined {
  if (mode === 'route') {
    const path = url.searchParams.get('path')
    return path ? { mode: 'route', path } : { mode: 'route' }
  }
  if (mode === 'spatial') {
    const surfaceId = url.searchParams.get('surfaceId')
    return surfaceId ? { mode: 'spatial', surfaceId } : { mode: 'spatial' }
  }
  return undefined
}

async function authenticate(req: Request, env: WorkerEnv): Promise<AuthIdentity | null> {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/.exec(header.trim())
  if (!match?.[1]) return null
  const token = match[1].trim()
  if (!token) return null

  // Member token: literal match against the MEMBER_TOKENS allow-list.
  if (env.MEMBER_TOKENS) {
    const members = env.MEMBER_TOKENS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (members.includes(token)) {
      // Use last 6 chars of token as the id so multiple members are distinguishable
      // in author rows without leaking the secret.
      const suffix = token.slice(-6)
      return { kind: 'member', id: `member-${suffix}`, display: 'Member' }
    }
  }

  // Share-link token: HMAC-verified per share-token.ts.
  if (env.SHARE_TOKEN_SECRET) {
    const verified = await verifyShareToken(token, env.SHARE_TOKEN_SECRET)
    if (verified.ok) {
      return {
        kind: 'reporter',
        id: verified.payload.reporterId,
        display: `Reporter ${verified.payload.reporterId.slice(0, 8)}`,
      }
    }
  }

  return null
}

function corsHeaders(req: Request, env: WorkerEnv): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const allowed = allow.length === 0 || allow.includes(origin) || allow.includes('*')
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
  }
  if (allowed) {
    headers['access-control-allow-origin'] = origin || '*'
    headers.vary = 'origin'
  }
  return headers
}

function jsonError(status: number, message: string, req: Request, env: WorkerEnv): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(req, env) },
  })
}
