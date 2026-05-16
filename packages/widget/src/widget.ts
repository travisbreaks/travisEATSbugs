/**
 * Unified widget facade.
 *
 * Single class `AnnotationWidget` that dispatches to drawer or overlay based on
 * `renderMode`. Aliased as `TravisEatsBugs` per the naming decision in
 * docs/extraction-strategy-2026-05-15.md ("Both, aliased").
 */

import type { ApiAdapter, AuthAdapter, ThemeAdapter } from './adapters'
import { AnnotationDrawer, type DrawerOpts, type ReporterPromptConfig } from './drawer'
import { AnnotationOverlay, type OverlayHeaderMode, type OverlayOpts } from './overlay'
import type { Annotation, CreateInput, UpdatePatch } from './types'

export type { ReporterPromptConfig } from './drawer'

/**
 * Audit event surfaced to the host app on every successful mutation. The
 * widget wraps the host's ApiAdapter at construction time so drawer +
 * overlay code paths don't need to know about audit; they just call the
 * adapter as usual, and the wrapper fires the callback on success.
 *
 * The adapter-side `audit` flag (e.g. CloudflareAdapter writes to
 * annotation_audit_log) is independent of this widget-side hook. Hosts
 * can use either, both, or neither.
 */
export type AuditEvent =
  | { action: 'create'; annotation: Annotation }
  | { action: 'update'; id: string; patch: UpdatePatch; annotation: Annotation }
  | { action: 'delete'; id: string }

export type AuditFn = (event: AuditEvent) => void

/**
 * Wrap an ApiAdapter so a callback fires after each successful mutation.
 * Exported so hosts can compose their own wraps if needed (e.g. wrap
 * twice for an audit log + a realtime broadcast). The widget facade uses
 * this internally when `onAudit` is set on `WidgetOpts`.
 */
export function wrapWithAudit(api: ApiAdapter, onAudit: AuditFn): ApiAdapter {
  const wrapped: ApiAdapter = {
    list: (q) => api.list(q),
    create: async (input: CreateInput) => {
      const result = await api.create(input)
      try {
        onAudit({ action: 'create', annotation: result })
      } catch {
        // Host callback threw; do not break the mutation pipeline.
      }
      return result
    },
    update: async (id: string, patch: UpdatePatch) => {
      const result = await api.update(id, patch)
      try {
        onAudit({ action: 'update', id, patch, annotation: result })
      } catch {
        // see above
      }
      return result
    },
    delete: async (id: string) => {
      await api.delete(id)
      try {
        onAudit({ action: 'delete', id })
      } catch {
        // see above
      }
    },
  }
  if (api.listAuthors) {
    const fn = api.listAuthors.bind(api)
    wrapped.listAuthors = fn
  }
  return wrapped
}

export type WidgetMount =
  | {
      renderMode: 'drawer'
      position?: { bottom: number; right: number }
      open?: boolean
    }
  | {
      renderMode: 'overlay'
      surface: HTMLElement
      surfaceId: string
      surfaceKind?: 'screenshot' | 'canvas'
      showSidebar?: boolean
      headerMode?: OverlayHeaderMode
      initialFilter?: 'all' | 'open' | 'resolved'
    }

export type WidgetOpts = {
  api: ApiAdapter
  auth?: AuthAdapter
  theme?: ThemeAdapter
  /**
   * Fires after every successful adapter mutation (create, update, delete).
   * Errors thrown inside the callback are swallowed so a host bug does not
   * break the mutation pipeline. Wire to your own audit log / analytics /
   * realtime broadcast.
   */
  onAudit?: AuditFn
  /**
   * Reporter mode: when `auth.getCurrentUser()` returns null, prompt the
   * reporter for a display name before allowing compose / click-to-place.
   * Name persists to localStorage. Plumbs through to drawer + overlay.
   */
  reporterPrompt?: ReporterPromptConfig
} & WidgetMount

export class AnnotationWidget {
  private drawer: AnnotationDrawer | null = null
  private overlay: AnnotationOverlay | null = null
  private mode: 'drawer' | 'overlay'

  constructor(opts: WidgetOpts) {
    this.mode = opts.renderMode
    // Wrap the host adapter so drawer + overlay don't need to know about
    // onAudit. If no onAudit set, this is a no-op identity wrap.
    const api = opts.onAudit ? wrapWithAudit(opts.api, opts.onAudit) : opts.api
    if (opts.renderMode === 'drawer') {
      const drawerOpts: DrawerOpts = {
        api,
        ...(opts.auth ? { auth: opts.auth } : {}),
        ...(opts.theme ? { theme: opts.theme } : {}),
        ...(opts.position ? { position: opts.position } : {}),
        ...(opts.open ? { open: opts.open } : {}),
        ...(opts.reporterPrompt ? { reporterPrompt: opts.reporterPrompt } : {}),
      }
      this.drawer = new AnnotationDrawer(drawerOpts)
    } else {
      const overlayOpts: OverlayOpts = {
        api,
        surface: opts.surface,
        surfaceId: opts.surfaceId,
        ...(opts.auth ? { auth: opts.auth } : {}),
        ...(opts.theme ? { theme: opts.theme } : {}),
        ...(opts.surfaceKind ? { surfaceKind: opts.surfaceKind } : {}),
        ...(opts.showSidebar !== undefined ? { showSidebar: opts.showSidebar } : {}),
        ...(opts.headerMode ? { headerMode: opts.headerMode } : {}),
        ...(opts.initialFilter ? { initialFilter: opts.initialFilter } : {}),
        ...(opts.reporterPrompt ? { reporterPrompt: opts.reporterPrompt } : {}),
      }
      this.overlay = new AnnotationOverlay(overlayOpts)
    }
  }

  mount(): void {
    this.drawer?.mount()
    this.overlay?.mount()
  }

  unmount(): void {
    this.drawer?.unmount()
    this.overlay?.unmount()
  }

  destroy(): void {
    this.unmount()
    this.drawer = null
    this.overlay = null
  }

  refresh(): void {
    this.drawer?.refresh()
    this.overlay?.refresh()
  }

  open(): void {
    this.drawer?.open()
  }

  close(): void {
    this.drawer?.close()
  }

  toggle(): void {
    this.drawer?.toggle()
  }

  get renderMode(): 'drawer' | 'overlay' {
    return this.mode
  }
}

// Naming: "Both, aliased." TravisEatsBugs is the brand alias, AnnotationWidget
// is the generic export. Same class either way.
export const TravisEatsBugs = AnnotationWidget
export type TravisEatsBugs = AnnotationWidget
