/**
 * Overlay render mode (Lion's Share pattern).
 *
 * Mounted onto a host-provided surface element. Click-to-place spatial pins,
 * numbered markers positioned by %, sidebar list with inline thread display,
 * resolve/reopen verb, optional faux-Chrome header strip.
 *
 * Source: docs/lions-share-pin-annotations-audit-2026-05-15.md §1, §6, §7.
 */

import type { ApiAdapter, AuthAdapter, ThemeAdapter } from './adapters'
import { captureSpatialAnchor } from './anchor-spatial'
import type { ReporterPromptConfig } from './drawer'
import { setReporterName } from './reporter'
import type { Annotation, AuthorRef } from './types'

export type OverlayHeaderMode = 'mac-chrome' | 'minimal' | 'none'

export type OverlayOpts = {
  api: ApiAdapter
  auth?: AuthAdapter
  theme?: ThemeAdapter
  /** The surface that pins are positioned relative to. */
  surface: HTMLElement
  /** Stable id for this surface (per-client / per-screenshot). */
  surfaceId: string
  surfaceKind?: 'screenshot' | 'canvas'
  /** Show the right-hand sidebar list. Default true. */
  showSidebar?: boolean
  /** Faux-browser header treatment on the surface. Default 'minimal'. */
  headerMode?: OverlayHeaderMode
  /** Initial filter. Default 'all'. */
  initialFilter?: 'all' | 'open' | 'resolved'
  /**
   * Reporter mode: when `auth.getCurrentUser()` returns null, surface a
   * name-input modal over the canvas before click-to-place is allowed.
   * Once the reporter sets a name, the surface accepts clicks normally.
   */
  reporterPrompt?: ReporterPromptConfig
}

type DraftState = { x: number; y: number; body: string } | null

const SHADOW_HOST_ATTR = 'data-travisEATSbugs-overlay'

export class AnnotationOverlay {
  private opts: OverlayOpts
  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null
  private items: Annotation[] = []
  private filter: 'all' | 'open' | 'resolved'
  private selectedId: string | null = null
  private draft: DraftState = null
  private isMounted = false
  private surfaceClickHandler: ((e: MouseEvent) => void) | null = null
  private awaitingReporter = false

  constructor(opts: OverlayOpts) {
    this.opts = opts
    this.filter = opts.initialFilter ?? 'all'
  }

  mount(): void {
    if (this.isMounted) return
    if (typeof document === 'undefined') return
    this.isMounted = true
    this.host = document.createElement('div')
    this.host.setAttribute(SHADOW_HOST_ATTR, this.opts.surfaceId)
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.appendChild(this.buildStyles())
    this.shadow.appendChild(this.buildPanel())
    // Append the shadow host inside the surface so positioning is local.
    this.opts.surface.appendChild(this.host)
    // Click-to-place handler binds to surface, not the shadow root,
    // because the markers and draft form live inside the shadow.
    this.surfaceClickHandler = (e: MouseEvent) => this.handleSurfaceClick(e)
    this.opts.surface.addEventListener('click', this.surfaceClickHandler)
    this.wireReporterPrompt()
    void this.checkReporter()
    this.refresh()
  }

  private async checkReporter(): Promise<void> {
    if (!this.opts.reporterPrompt || !this.opts.auth) return
    try {
      const user = await this.opts.auth.getCurrentUser()
      this.awaitingReporter = user === null
    } catch {
      this.awaitingReporter = true
    }
    this.render()
  }

  private wireReporterPrompt(): void {
    if (!this.shadow) return
    const input = this.shadow.querySelector<HTMLInputElement>('.reporter-input')
    const btn = this.shadow.querySelector<HTMLButtonElement>('.reporter-submit-btn')
    if (!input || !btn) return
    const submit = () => {
      const name = input.value.trim()
      if (!name) return
      const ref = setReporterName(name, {
        ...(this.opts.reporterPrompt?.namespace
          ? { namespace: this.opts.reporterPrompt.namespace }
          : {}),
      })
      const api = this.opts.api as ApiAdapter & {
        setCurrentUser?: (user: AuthorRef) => void
      }
      if (typeof api.setCurrentUser === 'function') {
        try {
          api.setCurrentUser(ref)
        } catch {
          // Adapter rejected the swap; auth still picks up the localStorage id.
        }
      }
      this.awaitingReporter = false
      this.render()
    }
    btn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })
  }

  unmount(): void {
    if (!this.isMounted) return
    if (this.surfaceClickHandler) {
      this.opts.surface.removeEventListener('click', this.surfaceClickHandler)
      this.surfaceClickHandler = null
    }
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host)
    this.host = null
    this.shadow = null
    this.isMounted = false
  }

  refresh(): void {
    void this.load()
  }

  private async load(): Promise<void> {
    if (!this.isMounted) return
    try {
      this.items = await this.opts.api.list({
        anchor: { mode: 'spatial', surfaceId: this.opts.surfaceId },
        state: 'all',
      })
    } catch {
      this.items = []
    }
    this.render()
  }

  private handleSurfaceClick(e: MouseEvent): void {
    // Reporter prompt still up: clicks on the surface are dropped until the
    // reporter sets a name. The reporter-overlay block already covers the
    // surface visually; this guard is the behavior-level twin.
    if (this.awaitingReporter) return
    // Ignore clicks that originate inside the shadow root (markers, sidebar).
    if (!(e.target instanceof Element)) return
    if (e.target.closest(`[${SHADOW_HOST_ATTR}]`)) return
    const anchor = captureSpatialAnchor(this.opts.surface, this.opts.surface, this.opts.surfaceId, {
      clientX: e.clientX,
      clientY: e.clientY,
      surfaceKind: this.opts.surfaceKind ?? 'screenshot',
    })
    if (anchor.mode !== 'spatial') return
    this.draft = { x: anchor.x, y: anchor.y, body: '' }
    this.selectedId = null
    this.render()
    // Focus the draft textarea after render.
    setTimeout(() => {
      const ta = this.shadow?.querySelector<HTMLTextAreaElement>('.draft textarea')
      ta?.focus()
    }, 0)
  }

  private buildStyles(): HTMLStyleElement {
    const style = document.createElement('style')
    style.textContent = `
      :host {
        --teb-surface-1: #ffffff;
        --teb-surface-2: #f6f6f7;
        --teb-fg: #0c0908;
        --teb-muted: #6c6a68;
        --teb-border: rgba(0, 0, 0, 0.10);
        --teb-accent: #c9a449;
        --teb-success: #2a9d57;
        --teb-danger: #c43932;
        --teb-z: 2147483645;
        --teb-radius: 12px;
        --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);
        --teb-ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);
        /* Subtle paper-grain noise tile, URL-encoded SVG with feTurbulence.
         * Only 6% alpha so the texture reads as a feel, not a pattern. */
        --teb-paper-texture: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");

        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: var(--teb-fg);
        display: block;
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .reporter-overlay {
        position: absolute;
        inset: 0;
        background: color-mix(in srgb, var(--teb-fg) 70%, transparent);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        z-index: 10;
      }
      .reporter-overlay[hidden] { display: none; }
      .reporter-card {
        background: var(--teb-surface-1);
        border-radius: var(--teb-radius);
        padding: 22px;
        max-width: 340px;
        width: 80%;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28);
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .reporter-label {
        margin: 0;
        font-size: 14px;
        color: var(--teb-fg);
        line-height: 1.4;
      }
      .reporter-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .reporter-input {
        flex: 1;
        font: inherit;
        color: inherit;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 8px;
        padding: 8px 10px;
        box-sizing: border-box;
      }
      .reporter-input:focus-visible {
        outline: 2px solid var(--teb-accent);
        outline-offset: 1px;
      }

      .marker {
        position: absolute;
        --teb-marker-tilt: 0deg;
        transform: translate(-50%, -50%) rotate(var(--teb-marker-tilt));
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--teb-accent);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        cursor: grab;
        pointer-events: auto;
        border: 2px solid #fff;
        box-shadow:
          0 2px 6px rgba(0,0,0,0.20),
          inset 0 -1px 1px rgba(0,0,0,0.10);
        transition:
          transform 200ms var(--teb-ease),
          box-shadow 200ms var(--teb-ease);
        touch-action: none;
        will-change: transform;
      }
      .marker:hover {
        transform: translate(-50%, -50%) rotate(var(--teb-marker-tilt)) scale(1.03);
        box-shadow:
          0 10px 18px rgba(0,0,0,0.22),
          0 2px 4px rgba(0,0,0,0.16),
          inset 0 -1px 1px rgba(0,0,0,0.10);
      }
      .marker:active {
        cursor: grabbing;
        transform: translate(-50%, -50%) rotate(var(--teb-marker-tilt)) scale(0.97);
        transition: transform 80ms var(--teb-ease);
      }
      .marker.dragging {
        cursor: grabbing;
        transition: none;
        transform: translate(-50%, -50%) rotate(var(--teb-marker-tilt)) scale(1.06);
        box-shadow:
          0 18px 28px rgba(0,0,0,0.28),
          0 4px 6px rgba(0,0,0,0.18),
          inset 0 -1px 1px rgba(0,0,0,0.10);
        z-index: 3;
      }
      .marker.resolved {
        background: var(--teb-success);
      }
      .marker[data-selected='true'] {
        box-shadow:
          0 2px 6px rgba(0,0,0,0.20),
          0 0 0 4px color-mix(in srgb, var(--teb-accent) 35%, transparent),
          inset 0 -1px 1px rgba(0,0,0,0.10);
      }
      .marker:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }

      .draft {
        position: absolute;
        --teb-draft-tilt: -0.4deg;
        transform: translate(-50%, calc(-100% - 12px)) rotate(var(--teb-draft-tilt));
        background:
          var(--teb-paper-texture),
          linear-gradient(180deg, #fffbe8 0%, #fff5d0 100%);
        background-blend-mode: multiply;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 2px;
        box-shadow:
          0 14px 28px rgba(0,0,0,0.22),
          0 2px 4px rgba(0,0,0,0.14),
          inset 0 -2px 0 rgba(0,0,0,0.04);
        padding: 12px;
        width: 240px;
        pointer-events: auto;
        z-index: 2;
      }
      .draft textarea {
        width: 100%;
        min-height: 60px;
        resize: vertical;
        font: inherit;
        color: inherit;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 6px;
        padding: 6px 8px;
        box-sizing: border-box;
      }
      .draft-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 6px;
      }

      .btn {
        font: inherit;
        color: inherit;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 6px;
        padding: 4px 10px;
        cursor: pointer;
        min-height: 28px;
      }
      .btn.primary {
        background: var(--teb-accent);
        color: #fff;
        border-color: transparent;
      }
      .btn.ghost { background: transparent; border-color: transparent; color: var(--teb-muted); }
      .btn:focus-visible { outline: 2px solid var(--teb-fg); outline-offset: 2px; }

      .header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 32px;
        background: var(--teb-surface-2);
        border-bottom: 1px solid var(--teb-border);
        display: flex;
        align-items: center;
        padding: 0 12px;
        gap: 10px;
        pointer-events: auto;
        font-size: 11px;
        color: var(--teb-muted);
      }
      .traffic { display: inline-flex; gap: 6px; }
      .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
      .dot.r { background: #FF5F57; }
      .dot.y { background: #FEBC2E; }
      .dot.g { background: #28C840; }

      .sidebar {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 280px;
        max-width: 40%;
        background: var(--teb-surface-1);
        border-left: 1px solid var(--teb-border);
        padding: 12px;
        overflow-y: auto;
        pointer-events: auto;
        box-sizing: border-box;
      }
      .filter-row {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
      }
      .chip {
        background: transparent;
        border: 1px solid var(--teb-border);
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
        color: var(--teb-muted);
      }
      .chip[data-active='true'] {
        background: var(--teb-fg);
        color: var(--teb-surface-1);
        border-color: transparent;
      }

      .sidebar-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .card {
        --teb-card-tilt: 0deg;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 2px;
        padding: 10px 12px;
        cursor: pointer;
        background:
          var(--teb-paper-texture),
          linear-gradient(180deg, #fffbe8 0%, #fff5d0 100%);
        background-blend-mode: multiply;
        box-shadow:
          0 1px 3px rgba(0,0,0,0.10),
          inset 0 -2px 0 rgba(0,0,0,0.03);
        transform: rotate(var(--teb-card-tilt));
        transition:
          transform 200ms var(--teb-ease),
          box-shadow 200ms var(--teb-ease);
        will-change: transform;
      }
      .card:hover {
        transform: rotate(var(--teb-card-tilt)) scale(1.02);
        box-shadow:
          0 10px 22px rgba(0,0,0,0.18),
          0 2px 4px rgba(0,0,0,0.12),
          inset 0 -2px 0 rgba(0,0,0,0.03);
      }
      .card[data-selected='true'] {
        border-color: var(--teb-accent);
        box-shadow:
          0 0 0 2px color-mix(in srgb, var(--teb-accent) 25%, transparent),
          0 6px 14px rgba(0,0,0,0.14),
          inset 0 -2px 0 rgba(0,0,0,0.03);
      }
      .card-head { display: flex; justify-content: space-between; font-size: 11px; color: var(--teb-muted); }
      .card-body { margin-top: 4px; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
      .card-thread { margin-top: 4px; font-style: italic; color: var(--teb-muted); font-size: 11px; }
      .card-actions { display: flex; gap: 6px; margin-top: 6px; }

      .empty {
        color: var(--teb-muted);
        font-size: 12px;
        padding: 12px;
        text-align: center;
      }

      @media (prefers-reduced-motion: reduce) {
        .marker,
        .marker:hover,
        .marker:active,
        .marker.dragging {
          transition: none;
          transform: translate(-50%, -50%);
        }
        .card,
        .card:hover {
          transform: none;
          transition: none;
        }
        .draft {
          transform: translate(-50%, calc(-100% - 12px));
        }
      }
    `
    return style
  }

  private buildPanel(): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.className = 'layer'
    const reporterPrompt =
      this.opts.reporterPrompt?.prompt ?? 'What name should we put on your notes?'
    const reporterPlaceholder = this.opts.reporterPrompt?.placeholder ?? 'Your name'
    const reporterSubmit = this.opts.reporterPrompt?.submitLabel ?? 'Continue'
    wrap.innerHTML = `
      ${this.renderHeader()}
      <div class="markers-layer"></div>
      <div class="draft-layer"></div>
      <div class="reporter-overlay" hidden>
        <div class="reporter-card">
          <p class="reporter-label">${escapeHtml(reporterPrompt)}</p>
          <div class="reporter-row">
            <input
              class="reporter-input"
              type="text"
              aria-label="Your display name"
              placeholder="${escapeHtml(reporterPlaceholder)}"
              maxlength="60"
            />
            <button class="btn primary reporter-submit-btn" type="button">${escapeHtml(reporterSubmit)}</button>
          </div>
        </div>
      </div>
      ${this.opts.showSidebar !== false ? '<aside class="sidebar"></aside>' : ''}
    `
    return wrap
  }

  private renderHeader(): string {
    const mode: OverlayHeaderMode = this.opts.headerMode ?? 'minimal'
    if (mode === 'none') return ''
    if (mode === 'mac-chrome') {
      return `<div class="header"><span class="traffic"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span></span><span class="url">${escapeHtml(this.opts.surfaceId)}</span></div>`
    }
    return `<div class="header"><span class="url">${escapeHtml(this.opts.surfaceId)}</span></div>`
  }

  private render(): void {
    if (!this.shadow) return
    const overlay = this.shadow.querySelector<HTMLDivElement>('.reporter-overlay')
    if (overlay) overlay.hidden = !this.awaitingReporter
    this.renderMarkers()
    this.renderDraft()
    if (this.opts.showSidebar !== false) this.renderSidebar()
  }

  private visiblePins(): Annotation[] {
    if (this.filter === 'all') return this.items
    return this.items.filter((a) => a.state === this.filter)
  }

  private renderMarkers(): void {
    const layer = this.shadow?.querySelector<HTMLDivElement>('.markers-layer')
    if (!layer) return
    layer.innerHTML = ''
    const pins = this.visiblePins()
    pins.forEach((a, i) => {
      if (a.anchor.mode !== 'spatial') return
      const anchor = a.anchor
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `marker${a.state === 'resolved' ? ' resolved' : ''}`
      btn.style.left = `${anchor.x}%`
      btn.style.top = `${anchor.y}%`
      btn.style.setProperty('--teb-marker-tilt', `${stableTiltFor(a.id).toFixed(3)}deg`)
      btn.textContent = String(i + 1)
      btn.setAttribute('aria-label', `Open annotation ${i + 1}, drag to reposition`)
      btn.dataset.selected = String(this.selectedId === a.id)
      this.wireMarkerDrag(btn, a)
      layer.appendChild(btn)
    })
  }

  /**
   * Wires pointer-based drag-to-reposition on a spatial marker. The drag
   * threshold (5 px) preserves the click-to-select behavior; below
   * threshold the marker behaves exactly as before.
   *
   * Optimistic visual update only writes to inline style during the
   * drag; the api.update is fired on pointerup if (and only if) the
   * marker moved past the threshold. If the update rejects we reload
   * from the adapter to snap back to the persisted position.
   */
  private wireMarkerDrag(btn: HTMLButtonElement, a: Annotation): void {
    if (a.anchor.mode !== 'spatial') return
    const baseX = a.anchor.x
    const baseY = a.anchor.y
    let startX = 0
    let startY = 0
    let dragging = false
    let pointerId: number | null = null
    let currentX = baseX
    let currentY = baseY

    const onMove = (e: PointerEvent): void => {
      if (pointerId === null || e.pointerId !== pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 5) return
      const rect = this.opts.surface.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      dragging = true
      btn.classList.add('dragging')
      currentX = clampPct(baseX + (dx / rect.width) * 100)
      currentY = clampPct(baseY + (dy / rect.height) * 100)
      btn.style.left = `${currentX}%`
      btn.style.top = `${currentY}%`
    }

    const cleanup = (): void => {
      btn.removeEventListener('pointermove', onMove)
      btn.removeEventListener('pointerup', onUp)
      btn.removeEventListener('pointercancel', onCancel)
      if (pointerId !== null && typeof btn.releasePointerCapture === 'function') {
        try {
          btn.releasePointerCapture(pointerId)
        } catch {
          // ignore: pointer may already be released
        }
      }
      pointerId = null
    }

    const onUp = (e: PointerEvent): void => {
      if (pointerId === null || e.pointerId !== pointerId) return
      const wasDragging = dragging
      cleanup()
      btn.classList.remove('dragging')
      if (wasDragging) {
        e.preventDefault()
        e.stopPropagation()
        const newX = currentX
        const newY = currentY
        // Suppress the click that fires on the same pointer release.
        btn.addEventListener(
          'click',
          (ev) => {
            ev.preventDefault()
            ev.stopPropagation()
          },
          { once: true, capture: true },
        )
        void this.commitAnchorMove(a, newX, newY)
      }
      dragging = false
    }

    const onCancel = (): void => {
      cleanup()
      if (dragging) {
        btn.classList.remove('dragging')
        // Snap visual back to the persisted position.
        btn.style.left = `${baseX}%`
        btn.style.top = `${baseY}%`
      }
      dragging = false
    }

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      currentX = baseX
      currentY = baseY
      if (typeof btn.setPointerCapture === 'function') {
        try {
          btn.setPointerCapture(e.pointerId)
        } catch {
          // ignore: some test environments lack pointer capture
        }
      }
      btn.addEventListener('pointermove', onMove)
      btn.addEventListener('pointerup', onUp)
      btn.addEventListener('pointercancel', onCancel)
    })

    // Plain click path: toggle selection when the pointer didn't drag.
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.selectedId = this.selectedId === a.id ? null : a.id
      this.draft = null
      this.render()
    })
  }

  private async commitAnchorMove(a: Annotation, x: number, y: number): Promise<void> {
    if (a.anchor.mode !== 'spatial') return
    const nextAnchor = { ...a.anchor, x, y }
    try {
      await this.opts.api.update(a.id, { anchor: nextAnchor })
      await this.load()
    } catch {
      // Snap back to the persisted shape on failure.
      await this.load()
    }
  }

  private renderDraft(): void {
    const layer = this.shadow?.querySelector<HTMLDivElement>('.draft-layer')
    if (!layer) return
    layer.innerHTML = ''
    if (!this.draft) return
    const wrap = document.createElement('div')
    wrap.className = 'draft'
    wrap.style.left = `${this.draft.x}%`
    wrap.style.top = `${this.draft.y}%`
    const ta = document.createElement('textarea')
    ta.placeholder = 'Describe what you see...'
    ta.value = this.draft.body
    ta.addEventListener('input', (e) => {
      if (this.draft) this.draft.body = (e.target as HTMLTextAreaElement).value
    })
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void this.commitDraft()
      } else if (e.key === 'Escape') {
        this.draft = null
        this.render()
      }
    })
    const actions = document.createElement('div')
    actions.className = 'draft-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'btn ghost'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', (e) => {
      e.stopPropagation()
      this.draft = null
      this.render()
    })
    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'btn primary'
    save.textContent = 'Add pin'
    save.addEventListener('click', (e) => {
      e.stopPropagation()
      void this.commitDraft()
    })
    actions.append(cancel, save)
    wrap.append(ta, actions)
    layer.appendChild(wrap)
  }

  private async commitDraft(): Promise<void> {
    if (!this.draft) return
    const body = this.draft.body.trim()
    if (!body) return
    const x = this.draft.x
    const y = this.draft.y
    this.draft = null
    this.render()
    try {
      await this.opts.api.create({
        anchor: {
          mode: 'spatial',
          surface: this.opts.surfaceKind ?? 'screenshot',
          surfaceId: this.opts.surfaceId,
          x,
          y,
        },
        body,
      })
      await this.load()
    } catch {
      // Restore the draft so the user can retry.
      this.draft = { x, y, body }
      this.render()
    }
  }

  private renderSidebar(): void {
    const aside = this.shadow?.querySelector<HTMLElement>('.sidebar')
    if (!aside) return
    aside.innerHTML = ''
    const filterRow = document.createElement('div')
    filterRow.className = 'filter-row'
    const chips: Array<['all' | 'open' | 'resolved', string]> = [
      ['all', 'All'],
      ['open', 'Open'],
      ['resolved', 'Resolved'],
    ]
    for (const [key, label] of chips) {
      const c = document.createElement('button')
      c.type = 'button'
      c.className = 'chip'
      c.textContent = label
      c.dataset.active = String(this.filter === key)
      c.addEventListener('click', () => {
        this.filter = key
        this.render()
      })
      filterRow.appendChild(c)
    }
    aside.appendChild(filterRow)

    const list = document.createElement('ul')
    list.className = 'sidebar-list'
    const pins = this.visiblePins()
    if (pins.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty'
      empty.textContent = this.opts.theme?.emptyStateCopy ?? 'No markers in this filter.'
      aside.appendChild(empty)
      return
    }
    pins.forEach((a, i) => {
      list.appendChild(this.renderCard(a, i + 1))
    })
    aside.appendChild(list)
  }

  private renderCard(a: Annotation, n: number): HTMLLIElement {
    const li = document.createElement('li')
    const card = document.createElement('div')
    card.className = 'card'
    card.dataset.selected = String(this.selectedId === a.id)
    card.addEventListener('click', () => {
      this.selectedId = this.selectedId === a.id ? null : a.id
      this.render()
    })
    const head = document.createElement('div')
    head.className = 'card-head'
    head.textContent = `#${n} · ${a.author.display}`
    const body = document.createElement('div')
    body.className = 'card-body'
    body.textContent = a.body
    card.append(head, body)
    if (a.thread && a.thread.length > 0) {
      const t = document.createElement('div')
      t.className = 'card-thread'
      t.textContent = a.thread.map((e) => e.body).join(' · ')
      card.appendChild(t)
    }
    const actions = document.createElement('div')
    actions.className = 'card-actions'
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'btn ghost'
    toggle.textContent = a.state === 'resolved' ? 'Reopen' : 'Resolve'
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      void this.toggleResolve(a)
    })
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn ghost'
    del.textContent = 'Delete'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      void this.deleteItem(a.id)
    })
    actions.append(toggle, del)
    card.appendChild(actions)
    li.appendChild(card)
    return li
  }

  private async toggleResolve(a: Annotation): Promise<void> {
    try {
      if (a.state === 'resolved') {
        await this.opts.api.update(a.id, { resolvedPR: null })
      } else {
        // Overlay mode doesn't capture a PR number; use 0 as the "resolved via toggle" sentinel,
        // matching Pivotal's no-action-PR convention from seed-page-notes-resolution.sql.
        await this.opts.api.update(a.id, { resolvedPR: 0 })
      }
      await this.load()
    } catch {
      // Silent fail.
    }
  }

  private async deleteItem(id: string): Promise<void> {
    try {
      await this.opts.api.delete(id)
      if (this.selectedId === id) this.selectedId = null
      await this.load()
    } catch {
      // Silent fail.
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clampPct(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

/**
 * Deterministic per-annotation rest tilt in degrees, range [-0.5, 0.5].
 * Hashing the id keeps tilt stable across re-renders + page reloads so
 * the surface doesn't shimmer when adjacent rows update.
 */
function stableTiltFor(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i)
  }
  const norm = ((h & 0xff) / 255 - 0.5) * 1
  return norm
}
