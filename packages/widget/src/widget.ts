/**
 * Unified widget facade.
 *
 * Single class `AnnotationWidget` that dispatches to drawer or overlay based on
 * `renderMode`. Aliased as `TravisEatsBugs` per the naming decision in
 * docs/extraction-strategy-2026-05-15.md ("Both, aliased").
 */

import type { ApiAdapter, AuthAdapter, ThemeAdapter } from './adapters'
import { AnnotationDrawer, type DrawerOpts } from './drawer'
import { AnnotationOverlay, type OverlayHeaderMode, type OverlayOpts } from './overlay'

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
} & WidgetMount

export class AnnotationWidget {
  private drawer: AnnotationDrawer | null = null
  private overlay: AnnotationOverlay | null = null
  private mode: 'drawer' | 'overlay'

  constructor(opts: WidgetOpts) {
    this.mode = opts.renderMode
    if (opts.renderMode === 'drawer') {
      const drawerOpts: DrawerOpts = {
        api: opts.api,
        ...(opts.auth ? { auth: opts.auth } : {}),
        ...(opts.theme ? { theme: opts.theme } : {}),
        ...(opts.position ? { position: opts.position } : {}),
        ...(opts.open ? { open: opts.open } : {}),
      }
      this.drawer = new AnnotationDrawer(drawerOpts)
    } else {
      const overlayOpts: OverlayOpts = {
        api: opts.api,
        surface: opts.surface,
        surfaceId: opts.surfaceId,
        ...(opts.auth ? { auth: opts.auth } : {}),
        ...(opts.theme ? { theme: opts.theme } : {}),
        ...(opts.surfaceKind ? { surfaceKind: opts.surfaceKind } : {}),
        ...(opts.showSidebar !== undefined ? { showSidebar: opts.showSidebar } : {}),
        ...(opts.headerMode ? { headerMode: opts.headerMode } : {}),
        ...(opts.initialFilter ? { initialFilter: opts.initialFilter } : {}),
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
