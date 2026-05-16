/**
 * Cloudflare D1-backed ApiAdapter for travisEATSbugs.
 *
 * Implements the full ApiAdapter contract from packages/widget against the
 * annotations table defined in migrations/001_annotations.sql. UpdatePatch
 * discrimination mirrors MemoryAdapter's behavior exactly (body OR
 * resolve OR reopen OR overlap, never combined; rejected at the adapter
 * boundary, never silently merged).
 */

import type {
  AnchorQuery,
  Annotation,
  AnnotationAnchor,
  ApiAdapter,
  AuthorRef,
  CreateInput,
  ListQuery,
  UpdatePatch,
} from '@travisbreaks/travisEATSbugs'
import type { CloudflareAdapterOptions, D1Like, D1PreparedStatementLike } from './types'

type AnnotationRow = {
  id: string
  anchor_mode: 'route' | 'spatial'
  anchor_path: string | null
  anchor_selector: string | null
  anchor_text_quote_exact: string | null
  anchor_text_quote_prefix: string | null
  anchor_text_quote_suffix: string | null
  anchor_viewport_x: number | null
  anchor_viewport_y: number | null
  anchor_viewport_w: number | null
  anchor_viewport_h: number | null
  anchor_surface_id: string | null
  anchor_surface_kind: 'screenshot' | 'canvas' | null
  anchor_x: number | null
  anchor_y: number | null
  body: string
  author_id: string
  author_display: string
  author_avatar_url: string | null
  created_at: number
  modified_at: number
  state: 'open' | 'resolved'
  severity: 'low' | 'medium' | 'high' | null
  resolved_pr: number | null
  resolved_at: number | null
  resolved_by: string | null
  resolution_note: string | null
  related_ids: string | null
  dup_of: string | null
  screenshot_url: string | null
  screenshot_w: number | null
  screenshot_h: number | null
}

export class CloudflareAdapter implements ApiAdapter {
  private db: D1Like
  private currentUser: AuthorRef
  private now: () => number
  private auditEnabled: boolean

  constructor(opts: CloudflareAdapterOptions) {
    this.db = opts.db
    this.currentUser = opts.currentUser
    this.now = opts.now ?? (() => Date.now())
    this.auditEnabled = opts.audit ?? false
  }

  async list(query: ListQuery = {}): Promise<Annotation[]> {
    const where: string[] = []
    const binds: unknown[] = []
    if (query.anchor) {
      if (query.anchor.mode === 'route') {
        where.push('anchor_mode = ?')
        binds.push('route')
        if (query.anchor.path) {
          where.push('anchor_path = ?')
          binds.push(query.anchor.path)
        }
      } else if (query.anchor.mode === 'spatial') {
        where.push('anchor_mode = ?')
        binds.push('spatial')
        if (query.anchor.surfaceId) {
          where.push('anchor_surface_id = ?')
          binds.push(query.anchor.surfaceId)
        }
      }
    }
    if (query.state && query.state !== 'all') {
      where.push('state = ?')
      binds.push(query.state)
    }
    const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const sql = `SELECT * FROM annotations${whereClause} ORDER BY created_at ASC`
    const stmt = bindAll(this.db.prepare(sql), binds)
    const result = await stmt.all<AnnotationRow>()
    return (result.results ?? []).map(rowToAnnotation)
  }

  async create(input: CreateInput): Promise<Annotation> {
    const ts = this.now()
    const id = makeId(ts)
    const anchorCols = serializeAnchor(input.anchor)
    const sql = `
      INSERT INTO annotations (
        id, anchor_mode,
        anchor_path, anchor_selector,
        anchor_text_quote_exact, anchor_text_quote_prefix, anchor_text_quote_suffix,
        anchor_viewport_x, anchor_viewport_y, anchor_viewport_w, anchor_viewport_h,
        anchor_surface_id, anchor_surface_kind, anchor_x, anchor_y,
        body, author_id, author_display, author_avatar_url,
        created_at, modified_at, state, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const stmt = this.db
      .prepare(sql)
      .bind(
        id,
        anchorCols.mode,
        anchorCols.path,
        anchorCols.selector,
        anchorCols.text_quote_exact,
        anchorCols.text_quote_prefix,
        anchorCols.text_quote_suffix,
        anchorCols.viewport_x,
        anchorCols.viewport_y,
        anchorCols.viewport_w,
        anchorCols.viewport_h,
        anchorCols.surface_id,
        anchorCols.surface_kind,
        anchorCols.x,
        anchorCols.y,
        input.body,
        this.currentUser.id,
        this.currentUser.display,
        this.currentUser.avatarUrl ?? null,
        ts,
        ts,
        'open',
        input.severity ?? null,
      )
    await stmt.run()
    await this.audit(id, 'create')
    const fetched = await this.fetch(id)
    if (!fetched) {
      throw new Error(`CloudflareAdapter: create succeeded but id ${id} not found`)
    }
    return fetched
  }

  async update(id: string, patch: UpdatePatch): Promise<Annotation> {
    validatePatch(patch)
    const existing = await this.fetch(id)
    if (!existing) {
      throw new Error(`CloudflareAdapter: annotation not found: ${id}`)
    }
    const ts = this.now()
    // Body edit
    if ('body' in patch && typeof patch.body === 'string') {
      await this.db
        .prepare('UPDATE annotations SET body = ?, modified_at = ? WHERE id = ?')
        .bind(patch.body, ts, id)
        .run()
      await this.audit(id, 'body_edit')
      return (await this.fetch(id)) as Annotation
    }
    // Resolve OR reopen
    if ('resolvedPR' in patch) {
      if (patch.resolvedPR === null) {
        // Reopen: clear all four resolution columns.
        await this.db
          .prepare(
            `UPDATE annotations
             SET state = 'open',
                 resolved_pr = NULL,
                 resolved_at = NULL,
                 resolved_by = NULL,
                 resolution_note = NULL,
                 modified_at = ?
             WHERE id = ?`,
          )
          .bind(ts, id)
          .run()
        await this.audit(id, 'reopen')
        return (await this.fetch(id)) as Annotation
      }
      const resolvePatch = patch as Extract<UpdatePatch, { resolvedPR: number }>
      await this.db
        .prepare(
          `UPDATE annotations
           SET state = 'resolved',
               resolved_pr = ?,
               resolved_at = ?,
               resolved_by = ?,
               resolution_note = ?,
               related_ids = COALESCE(?, related_ids),
               dup_of = COALESCE(?, dup_of),
               modified_at = ?
           WHERE id = ?`,
        )
        .bind(
          resolvePatch.resolvedPR,
          ts,
          this.currentUser.id,
          resolvePatch.resolutionNote ?? null,
          resolvePatch.relatedIds ? JSON.stringify(resolvePatch.relatedIds) : null,
          resolvePatch.dupOf ?? null,
          ts,
          id,
        )
        .run()
      await this.audit(id, 'resolve')
      return (await this.fetch(id)) as Annotation
    }
    // Overlap-only
    const overlap = patch as { relatedIds?: string[]; dupOf?: string }
    await this.db
      .prepare(
        `UPDATE annotations
         SET related_ids = COALESCE(?, related_ids),
             dup_of = COALESCE(?, dup_of),
             modified_at = ?
         WHERE id = ?`,
      )
      .bind(
        overlap.relatedIds ? JSON.stringify(overlap.relatedIds) : null,
        overlap.dupOf ?? null,
        ts,
        id,
      )
      .run()
    await this.audit(id, 'overlap_mark')
    return (await this.fetch(id)) as Annotation
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.prepare('DELETE FROM annotations WHERE id = ?').bind(id).run()
    if (result.meta && typeof result.meta.changes === 'number' && result.meta.changes === 0) {
      throw new Error(`CloudflareAdapter: annotation not found: ${id}`)
    }
    await this.audit(id, 'delete')
  }

  async listAuthors(): Promise<AuthorRef[]> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT author_id AS id, author_display AS display, author_avatar_url AS avatar_url
         FROM annotations
         ORDER BY author_display ASC`,
      )
      .all<{ id: string; display: string; avatar_url: string | null }>()
    return (result.results ?? []).map((r) => {
      const author: AuthorRef = { id: r.id, display: r.display }
      if (r.avatar_url) author.avatarUrl = r.avatar_url
      return author
    })
  }

  /**
   * Swap the current-user identity at runtime. Mirrors MemoryAdapter so the
   * reporter name-prompt flow works regardless of which adapter is wired.
   */
  setCurrentUser(user: AuthorRef): void {
    this.currentUser = user
  }

  private async fetch(id: string): Promise<Annotation | null> {
    const row = await this.db
      .prepare('SELECT * FROM annotations WHERE id = ?')
      .bind(id)
      .first<AnnotationRow>()
    return row ? rowToAnnotation(row) : null
  }

  private async audit(annotationId: string, action: string): Promise<void> {
    if (!this.auditEnabled) return
    await this.db
      .prepare(
        `INSERT INTO annotation_audit_log (annotation_id, action, actor_id, at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(annotationId, action, this.currentUser.id, this.now())
      .run()
  }
}

function bindAll(stmt: D1PreparedStatementLike, values: unknown[]): D1PreparedStatementLike {
  return values.length > 0 ? stmt.bind(...values) : stmt
}

function makeId(ts: number): string {
  return `local-${ts}-${Math.random().toString(36).slice(2, 8)}`
}

type AnchorCols = {
  mode: 'route' | 'spatial'
  path: string | null
  selector: string | null
  text_quote_exact: string | null
  text_quote_prefix: string | null
  text_quote_suffix: string | null
  viewport_x: number | null
  viewport_y: number | null
  viewport_w: number | null
  viewport_h: number | null
  surface_id: string | null
  surface_kind: 'screenshot' | 'canvas' | null
  x: number | null
  y: number | null
}

function serializeAnchor(anchor: AnnotationAnchor): AnchorCols {
  const empty: AnchorCols = {
    mode: anchor.mode,
    path: null,
    selector: null,
    text_quote_exact: null,
    text_quote_prefix: null,
    text_quote_suffix: null,
    viewport_x: null,
    viewport_y: null,
    viewport_w: null,
    viewport_h: null,
    surface_id: null,
    surface_kind: null,
    x: null,
    y: null,
  }
  if (anchor.mode === 'route') {
    return {
      ...empty,
      path: anchor.path,
      selector: anchor.selector ?? null,
      text_quote_exact: anchor.textQuote?.exact ?? null,
      text_quote_prefix: anchor.textQuote?.prefix ?? null,
      text_quote_suffix: anchor.textQuote?.suffix ?? null,
      viewport_x: anchor.viewport?.x ?? null,
      viewport_y: anchor.viewport?.y ?? null,
      viewport_w: anchor.viewport?.w ?? null,
      viewport_h: anchor.viewport?.h ?? null,
    }
  }
  return {
    ...empty,
    surface_id: anchor.surfaceId,
    surface_kind: anchor.surface,
    x: anchor.x,
    y: anchor.y,
  }
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  const anchor: AnnotationAnchor =
    row.anchor_mode === 'route'
      ? {
          mode: 'route',
          path: row.anchor_path ?? '',
          ...(row.anchor_selector ? { selector: row.anchor_selector } : {}),
          ...(row.anchor_text_quote_exact
            ? {
                textQuote: {
                  exact: row.anchor_text_quote_exact,
                  ...(row.anchor_text_quote_prefix ? { prefix: row.anchor_text_quote_prefix } : {}),
                  ...(row.anchor_text_quote_suffix ? { suffix: row.anchor_text_quote_suffix } : {}),
                },
              }
            : {}),
          ...(row.anchor_viewport_x !== null &&
          row.anchor_viewport_y !== null &&
          row.anchor_viewport_w !== null &&
          row.anchor_viewport_h !== null
            ? {
                viewport: {
                  x: row.anchor_viewport_x,
                  y: row.anchor_viewport_y,
                  w: row.anchor_viewport_w,
                  h: row.anchor_viewport_h,
                },
              }
            : {}),
        }
      : {
          mode: 'spatial',
          surface: row.anchor_surface_kind ?? 'canvas',
          surfaceId: row.anchor_surface_id ?? '',
          x: row.anchor_x ?? 0,
          y: row.anchor_y ?? 0,
        }

  const author: AuthorRef = { id: row.author_id, display: row.author_display }
  if (row.author_avatar_url) author.avatarUrl = row.author_avatar_url

  const annotation: Annotation = {
    id: row.id,
    anchor,
    body: row.body,
    author,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    state: row.state,
  }
  if (row.severity) annotation.severity = row.severity
  if (row.resolved_pr !== null) annotation.resolvedPR = row.resolved_pr
  if (row.resolved_at !== null) annotation.resolvedAt = row.resolved_at
  if (row.resolved_by) annotation.resolvedBy = row.resolved_by
  if (row.resolution_note) annotation.resolutionNote = row.resolution_note
  if (row.related_ids) {
    try {
      const parsed = JSON.parse(row.related_ids)
      if (Array.isArray(parsed)) annotation.relatedIds = parsed
    } catch {
      // tolerate malformed JSON in legacy rows
    }
  }
  if (row.dup_of) annotation.dupOf = row.dup_of
  if (row.screenshot_url && row.screenshot_w !== null && row.screenshot_h !== null) {
    annotation.screenshot = {
      url: row.screenshot_url,
      w: row.screenshot_w,
      h: row.screenshot_h,
    }
  }
  return annotation
}

function validatePatch(patch: UpdatePatch): void {
  const hasBody = 'body' in patch && typeof (patch as { body?: unknown }).body === 'string'
  const hasResolvedPR = 'resolvedPR' in patch
  const resolvedPR = hasResolvedPR ? (patch as { resolvedPR: number | null }).resolvedPR : undefined
  const hasOverlap = 'relatedIds' in patch || 'dupOf' in patch || 'resolutionNote' in patch
  const isReopen = hasResolvedPR && resolvedPR === null

  if (hasBody && (hasResolvedPR || hasOverlap)) {
    throw new Error(
      'CloudflareAdapter: body edit cannot be combined with resolution or overlap fields',
    )
  }
  if (isReopen && hasOverlap) {
    throw new Error('CloudflareAdapter: reopen patch cannot carry overlap fields')
  }
  if (!hasBody && !hasResolvedPR && !hasOverlap) {
    throw new Error('CloudflareAdapter: empty patch')
  }
}
