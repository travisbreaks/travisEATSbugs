/**
 * In-memory ApiAdapter for playground + tests.
 *
 * Single Map keyed by annotation id. Generates `local-${ts}-${rand}` ids.
 * Validates UpdatePatch shapes: body OR resolution OR reopen OR overlap, never
 * combined (mirrors Pivotal `/api/page-notes` PATCH discrimination from
 * pivotal-extraction-audit-2026-05-15.md §1).
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

export type MemoryAdapterOptions = {
  seed?: Annotation[]
  currentUser?: AuthorRef
  now?: () => number
}

const DEFAULT_USER: AuthorRef = { id: 'demo', display: 'You' }

export class MemoryAdapter implements ApiAdapter {
  private store = new Map<string, Annotation>()
  private currentUser: AuthorRef
  private now: () => number

  constructor(options: MemoryAdapterOptions = {}) {
    this.currentUser = options.currentUser ?? DEFAULT_USER
    this.now = options.now ?? (() => Date.now())
    if (options.seed) {
      for (const a of options.seed) {
        this.store.set(a.id, a)
      }
    }
  }

  async list(query: ListQuery = {}): Promise<Annotation[]> {
    const out: Annotation[] = []
    for (const a of this.store.values()) {
      if (!matchAnchor(a, query.anchor)) continue
      if (!matchState(a, query.state)) continue
      out.push(a)
    }
    // Stable sort: createdAt ascending (older notes first in the list).
    out.sort((a, b) => a.createdAt - b.createdAt)
    return out
  }

  async create(input: CreateInput): Promise<Annotation> {
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
    }
    this.store.set(id, annotation)
    return annotation
  }

  async update(id: string, patch: UpdatePatch): Promise<Annotation> {
    const existing = this.store.get(id)
    if (!existing) {
      throw new Error(`MemoryAdapter: annotation not found: ${id}`)
    }
    validatePatch(patch)
    const ts = this.now()
    const next: Annotation = applyPatch(existing, patch, ts, this.currentUser)
    this.store.set(id, next)
    return next
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new Error(`MemoryAdapter: annotation not found: ${id}`)
    }
    this.store.delete(id)
  }

  /**
   * Swap the current-user identity at runtime. Used by the reporter
   * name-prompt flow: when a previously anonymous reporter sets their
   * display name, the widget calls this so subsequent annotations are
   * stamped with the new identity instead of the constructor default.
   */
  setCurrentUser(user: AuthorRef): void {
    this.currentUser = user
  }

  async listAuthors(): Promise<AuthorRef[]> {
    const seen = new Map<string, AuthorRef>()
    for (const a of this.store.values()) {
      if (!seen.has(a.author.id)) {
        seen.set(a.author.id, a.author)
      }
    }
    return Array.from(seen.values())
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

/**
 * Discriminate the patch shape strictly. A patch is exactly one of:
 *   - body edit
 *   - resolve (resolvedPR is a number)
 *   - reopen (resolvedPR === null)
 *   - overlap-only (relatedIds / dupOf without resolvedPR)
 *
 * Mixing body + resolution is rejected (Pivotal route.ts behavior).
 */
function validatePatch(patch: UpdatePatch): void {
  const hasBody = 'body' in patch && typeof (patch as { body?: unknown }).body === 'string'
  const hasResolvedPR = 'resolvedPR' in patch
  const resolvedPR = hasResolvedPR ? (patch as { resolvedPR: number | null }).resolvedPR : undefined
  const hasOverlap = 'relatedIds' in patch || 'dupOf' in patch || 'resolutionNote' in patch
  const isReopen = hasResolvedPR && resolvedPR === null
  const isResolve = hasResolvedPR && typeof resolvedPR === 'number'

  if (hasBody && (hasResolvedPR || hasOverlap)) {
    throw new Error('MemoryAdapter: body edit cannot be combined with resolution or overlap fields')
  }
  if (isReopen && hasOverlap) {
    // Reopen clears resolution columns; overlap fields are not allowed in a reopen.
    throw new Error('MemoryAdapter: reopen patch cannot carry overlap fields')
  }
  if (!hasBody && !hasResolvedPR && !hasOverlap) {
    throw new Error('MemoryAdapter: empty patch')
  }
  // resolve OR overlap-only are both valid; nothing more to check.
  void isResolve
}

function applyPatch(
  existing: Annotation,
  patch: UpdatePatch,
  ts: number,
  currentUser: AuthorRef,
): Annotation {
  // Body edit
  if ('body' in patch && typeof patch.body === 'string') {
    return { ...existing, body: patch.body, modifiedAt: ts }
  }
  // Resolve OR reopen
  if ('resolvedPR' in patch) {
    if (patch.resolvedPR === null) {
      // Reopen: clear all four resolution columns. Rebuild via destructure
      // so the omitted keys disappear from the shape.
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
  // Overlap-only
  const overlap = patch as { relatedIds?: string[]; dupOf?: string }
  return {
    ...existing,
    ...(overlap.relatedIds ? { relatedIds: overlap.relatedIds } : {}),
    ...(overlap.dupOf ? { dupOf: overlap.dupOf } : {}),
    modifiedAt: ts,
  }
}
