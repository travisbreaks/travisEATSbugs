/**
 * localStorage-backed ApiAdapter.
 *
 * Namespaced key per instance. SSR-safe: every method checks `typeof window`.
 * Catches quota errors silently and keeps the in-memory mirror so the session
 * continues to function. The Lions-Share shadow-state pattern is NOT needed
 * here because this adapter owns the data fully (no immutable seed).
 *
 * Source: docs/lions-share-pin-annotations-audit-2026-05-15.md §1 (persistence).
 */

import type { ApiAdapter } from './adapters'
import type {
  AnchorQuery,
  Annotation,
  AuthorRef,
  CreateInput,
  ListQuery,
  UpdatePatch,
} from './types'

export type LocalStorageAdapterOptions = {
  namespace: string
  currentUser?: AuthorRef
  now?: () => number
}

const DEFAULT_USER: AuthorRef = { id: 'demo', display: 'You' }

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export class LocalStorageAdapter implements ApiAdapter {
  private key: string
  private currentUser: AuthorRef
  private now: () => number
  private memory: Annotation[] = []
  private hydrated = false

  constructor(options: LocalStorageAdapterOptions) {
    this.key = `travisEATSbugs:${options.namespace}`
    this.currentUser = options.currentUser ?? DEFAULT_USER
    this.now = options.now ?? (() => Date.now())
  }

  private hydrate(): void {
    if (this.hydrated) return
    this.hydrated = true
    if (!hasLocalStorage()) return
    try {
      const raw = window.localStorage.getItem(this.key)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.memory = parsed as Annotation[]
      }
    } catch {
      // Corrupted state: ignore, leave memory empty.
    }
  }

  private persist(): void {
    if (!hasLocalStorage()) return
    try {
      window.localStorage.setItem(this.key, JSON.stringify(this.memory))
    } catch {
      // Quota / private-browsing: stay in memory for the session.
    }
  }

  async list(query: ListQuery = {}): Promise<Annotation[]> {
    if (!hasLocalStorage()) return []
    this.hydrate()
    return this.memory
      .filter((a) => matchAnchor(a, query.anchor) && matchState(a, query.state))
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async create(input: CreateInput): Promise<Annotation> {
    if (!hasLocalStorage()) {
      // SSR no-op: still return a synthetic annotation so callers don't crash.
      const ts = this.now()
      return synth(input, ts, this.currentUser)
    }
    this.hydrate()
    const ts = this.now()
    const id = `local-${ts}-${Math.random().toString(36).slice(2, 8)}`
    const annotation: Annotation = {
      id,
      anchor: input.anchor,
      body: input.body,
      author: this.currentUser,
      createdAt: ts,
      modifiedAt: ts,
      state: 'open',
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.screenshot ? { screenshot: input.screenshot } : {}),
    }
    this.memory.push(annotation)
    this.persist()
    return annotation
  }

  async update(id: string, patch: UpdatePatch): Promise<Annotation> {
    if (!hasLocalStorage()) {
      throw new Error('LocalStorageAdapter: no window context')
    }
    this.hydrate()
    const idx = this.memory.findIndex((a) => a.id === id)
    if (idx === -1) {
      throw new Error(`LocalStorageAdapter: annotation not found: ${id}`)
    }
    const existing = this.memory[idx]
    if (!existing) {
      throw new Error(`LocalStorageAdapter: annotation not found: ${id}`)
    }
    validatePatch(patch)
    const next = applyPatch(existing, patch, this.now(), this.currentUser)
    this.memory[idx] = next
    this.persist()
    return next
  }

  async delete(id: string): Promise<void> {
    if (!hasLocalStorage()) return
    this.hydrate()
    const idx = this.memory.findIndex((a) => a.id === id)
    if (idx === -1) {
      throw new Error(`LocalStorageAdapter: annotation not found: ${id}`)
    }
    this.memory.splice(idx, 1)
    this.persist()
  }

  async listAuthors(): Promise<AuthorRef[]> {
    if (!hasLocalStorage()) return []
    this.hydrate()
    const seen = new Map<string, AuthorRef>()
    for (const a of this.memory) {
      if (!seen.has(a.author.id)) seen.set(a.author.id, a.author)
    }
    return Array.from(seen.values())
  }
}

function synth(input: CreateInput, ts: number, author: AuthorRef): Annotation {
  return {
    id: `local-${ts}-ssr`,
    anchor: input.anchor,
    body: input.body,
    author,
    createdAt: ts,
    modifiedAt: ts,
    state: 'open',
    ...(input.severity ? { severity: input.severity } : {}),
    ...(input.screenshot ? { screenshot: input.screenshot } : {}),
  }
}

function matchAnchor(a: Annotation, q: AnchorQuery | undefined): boolean {
  if (!q) return true
  if (q.mode === 'route') {
    if (a.anchor.mode !== 'route') return false
    if (q.path && a.anchor.path !== q.path) return false
    return true
  }
  if (q.mode === 'spatial') {
    if (a.anchor.mode !== 'spatial') return false
    if (q.surfaceId && a.anchor.surfaceId !== q.surfaceId) return false
    return true
  }
  return true
}

function matchState(a: Annotation, state: ListQuery['state']): boolean {
  if (!state || state === 'all') return true
  return a.state === state
}

function validatePatch(patch: UpdatePatch): void {
  const hasBody = 'body' in patch && typeof (patch as { body?: unknown }).body === 'string'
  const hasResolvedPR = 'resolvedPR' in patch
  const resolvedPR = hasResolvedPR ? (patch as { resolvedPR: number | null }).resolvedPR : undefined
  const hasOverlap = 'relatedIds' in patch || 'dupOf' in patch || 'resolutionNote' in patch
  const hasTriage = 'triage' in patch
  const isReopen = hasResolvedPR && resolvedPR === null
  if (hasBody && (hasResolvedPR || hasOverlap || hasTriage)) {
    throw new Error(
      'LocalStorageAdapter: body edit cannot be combined with resolution or overlap fields',
    )
  }
  if (isReopen && hasOverlap) {
    throw new Error('LocalStorageAdapter: reopen patch cannot carry overlap fields')
  }
  if (hasTriage && (hasResolvedPR || hasOverlap)) {
    throw new Error(
      'LocalStorageAdapter: triage patch cannot be combined with resolution or overlap fields',
    )
  }
  if (!hasBody && !hasResolvedPR && !hasOverlap && !hasTriage) {
    throw new Error('LocalStorageAdapter: empty patch')
  }
}

function applyPatch(
  existing: Annotation,
  patch: UpdatePatch,
  ts: number,
  currentUser: AuthorRef,
): Annotation {
  if ('body' in patch && typeof patch.body === 'string') {
    return { ...existing, body: patch.body, modifiedAt: ts }
  }
  if ('resolvedPR' in patch) {
    if (patch.resolvedPR === null) {
      const {
        resolvedPR: _rpr,
        resolvedAt: _rat,
        resolvedBy: _rby,
        resolutionNote: _rno,
        ...rest
      } = existing
      void _rpr
      void _rat
      void _rby
      void _rno
      return { ...rest, state: 'open', modifiedAt: ts }
    }
    const resolvePatch = patch as Extract<UpdatePatch, { resolvedPR: number }>
    return {
      ...existing,
      state: 'resolved',
      resolvedPR: resolvePatch.resolvedPR,
      resolvedAt: ts,
      resolvedBy: currentUser.id,
      ...(resolvePatch.resolutionNote ? { resolutionNote: resolvePatch.resolutionNote } : {}),
      ...(resolvePatch.relatedIds ? { relatedIds: resolvePatch.relatedIds } : {}),
      ...(resolvePatch.dupOf ? { dupOf: resolvePatch.dupOf } : {}),
      modifiedAt: ts,
    }
  }
  if ('triage' in patch) {
    const triagePatch = patch as Extract<UpdatePatch, { triage: unknown }>
    return {
      ...existing,
      triage: { ...triagePatch.triage, triagedAt: triagePatch.triage.triagedAt ?? ts },
      modifiedAt: ts,
    }
  }
  const overlap = patch as { relatedIds?: string[]; dupOf?: string }
  return {
    ...existing,
    ...(overlap.relatedIds ? { relatedIds: overlap.relatedIds } : {}),
    ...(overlap.dupOf ? { dupOf: overlap.dupOf } : {}),
    modifiedAt: ts,
  }
}
