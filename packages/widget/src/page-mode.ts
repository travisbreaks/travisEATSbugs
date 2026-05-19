/**
 * Page mode: the BugHerd core loop.
 *
 * Mounts a shadow-DOM overlay on document.body that:
 *   - shows on-page pins for every route-anchored annotation, positioned via
 *     the stored CSS selector / xpath against the live DOM
 *   - intercepts "feedback mode" clicks anywhere on the page (capture-phase
 *     document listener), captures the click target via captureRouteAnchor,
 *     and opens an inline sticky-note compose form at the click point
 *   - reads/writes through the supplied ApiAdapter so triage + audit wraps
 *     compose just like drawer + overlay
 *
 * State machine:
 *   - idle: overlay hidden, no listeners attached
 *   - active: pins visible, feedback mode armed, document click listener live
 *     (sub-state composing: an inline compose card is open over a captured
 *     click point or a selected pin)
 *
 * Toggle is owned by the host (typically the floating bug button). The host
 * calls `activate()` / `deactivate()` on this instance; we do not own the
 * button.
 *
 * Re-anchoring on scroll / resize: every animation frame while active, each
 * pin re-resolves its target via stored selector (fallback xpath) and updates
 * its viewport position. Pins whose target has been removed render in a
 * "stale" tray at the bottom of the viewport so they're not lost.
 */

import type { ApiAdapter, AuthAdapter } from './adapters'
import { captureRouteAnchor } from './anchor-route'
import { captureEnvironment } from './environment'
import { onRouteChange } from './route-watcher'
import type { Annotation, AnnotationAnchor, AnnotationKind, AuthorRef, CreateInput } from './types'

const HOST_ID = 'travisEATSbugs-page-host'
const ATTR_PIN = 'data-teb-pin'
const ATTR_HOST = 'data-teb-page-host'
/** The floating bug-button's shadow host. Page mode must NEVER intercept a
 * click on it — that would make the button impossible to use as the disarm
 * gesture. See bug-mode.ts HOST_ID. */
const BUG_BUTTON_HOST_ID = 'travisEATSbugs-host'

export type PageModeOpts = {
  api: ApiAdapter
  auth?: AuthAdapter
  /** Filter pins to a single route (defaults to `window.location.pathname`).
   * Pass () => '*' to show all pins regardless of route. */
  routeFilter?: () => string
  /** Optional callback fired when feedback mode produces a new annotation.
   * Useful for host analytics. Errors are swallowed. */
  onCreate?: (annotation: Annotation) => void
  /** Optional cursor in feedback mode. Default 'crosshair'. */
  feedbackCursor?: string
  /**
   * Element ids of floating UI that should NOT count as "page clicks" while
   * feedback mode is armed. The bug-button host (`travisEATSbugs-host`) is
   * always included so the user can re-click the button to disarm. Add any
   * other floating launchers / chat widgets on the host page that should
   * keep working while feedback mode is on.
   */
  ignoreHostIds?: string[]
  /**
   * Show a short ribbon near the bug button instructing the reporter to
   * "Click any element to drop a note." Defaults to true. The ribbon
   * auto-hides after the reporter clicks anywhere (mode flips to composing)
   * and reappears the next time feedback mode is armed.
   */
  showHint?: boolean
  /** Hint copy. Default: "Click any element to drop a note." */
  hintText?: string
}

type PinView = {
  id: string
  annotation: Annotation
  /** Resolved target element, or null if the selector / xpath failed. */
  target: Element | null
  /** Last computed viewport coords (top-left of the pin marker). */
  vx: number
  vy: number
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'active' }
  | {
      kind: 'composing-new'
      anchor: AnnotationAnchor
      vx: number
      vy: number
      target: Element | null
    }
  | { kind: 'viewing'; pin: PinView }

export class AnnotationPageMode {
  private opts: PageModeOpts
  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null
  private items: Annotation[] = []
  private pins: Map<string, PinView> = new Map()
  private mode: Mode = { kind: 'idle' }
  private rafId: number | null = null
  private docClickHandler: ((e: MouseEvent) => void) | null = null
  private docKeyHandler: ((e: KeyboardEvent) => void) | null = null
  private docMoveHighlightHandler: ((e: MouseEvent) => void) | null = null
  private currentHover: Element | null = null
  private composeValue = ''
  private composeEmail = ''
  private composeKind: AnnotationKind | null = null
  private mounted = false
  private unsubscribeRoute: (() => void) | null = null

  constructor(opts: PageModeOpts) {
    this.opts = opts
  }

  mount(): void {
    if (this.mounted) return
    if (typeof document === 'undefined') return
    this.mounted = true
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    this.host.setAttribute(ATTR_HOST, '')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.appendChild(this.buildStyles())
    const root = document.createElement('div')
    root.className = 'teb-root'
    root.setAttribute('aria-hidden', 'true')
    this.shadow.appendChild(root)
    document.body.appendChild(this.host)
    // Re-fetch + re-filter pins when the host app navigates without a
    // full reload (Next.js, React Router, Vue Router all do this).
    // Fixes the 2026-05-18 regression where pins from page A stayed
    // rendered after navigating to page B.
    this.unsubscribeRoute = onRouteChange(() => {
      // Composing-new state references the OLD page's DOM; cancel any
      // open compose card so it can't write back to a stale anchor.
      // A viewed pin from the old page is no longer meaningful either;
      // drop back to plain active so the new page can be navigated.
      if (this.mode.kind === 'composing-new') {
        this.cancelCompose()
      } else if (this.mode.kind === 'viewing') {
        this.mode = { kind: 'active' }
      }
      void this.refresh()
    })
    void this.refresh()
  }

  async refresh(): Promise<void> {
    const route = this.routeFilter()
    const all = await this.opts.api.list({ state: 'all' })
    this.items = all.filter((a) => {
      if (a.anchor.mode !== 'route') return false
      if (route === '*') return true
      return a.anchor.path === route
    })
    this.rebuildPinViews()
    this.render()
  }

  activate(): void {
    if (this.mode.kind !== 'idle') return
    this.mode = { kind: 'active' }
    this.attachListeners()
    this.startRaf()
    this.render()
  }

  deactivate(): void {
    if (this.mode.kind === 'idle') return
    this.mode = { kind: 'idle' }
    this.detachListeners()
    this.stopRaf()
    this.clearHover()
    this.render()
  }

  /** True if the bug button should display its on-state. */
  isActive(): boolean {
    return this.mode.kind !== 'idle'
  }

  destroy(): void {
    this.deactivate()
    if (this.unsubscribeRoute) {
      this.unsubscribeRoute()
      this.unsubscribeRoute = null
    }
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host)
    this.host = null
    this.shadow = null
    this.mounted = false
  }

  /* ----------------------------- internals ----------------------------- */

  private routeFilter(): string {
    if (this.opts.routeFilter) return this.opts.routeFilter()
    if (typeof window === 'undefined') return '/'
    return window.location.pathname || '/'
  }

  private rebuildPinViews(): void {
    this.pins.clear()
    for (const a of this.items) {
      if (a.anchor.mode !== 'route') continue
      const target = resolveTarget(a.anchor)
      const rect = target?.getBoundingClientRect?.()
      const vx = rect ? rect.right - 18 : 16
      const vy = rect ? rect.top - 18 : 16 + this.pins.size * 36
      this.pins.set(a.id, { id: a.id, annotation: a, target, vx, vy })
    }
  }

  private attachListeners(): void {
    if (typeof document === 'undefined') return
    this.docClickHandler = (e: MouseEvent) => this.handleDocumentClick(e)
    this.docKeyHandler = (e: KeyboardEvent) => this.handleKey(e)
    this.docMoveHighlightHandler = (e: MouseEvent) => this.handleHoverMove(e)
    // Capture-phase so we see clicks before any host handlers.
    document.addEventListener('click', this.docClickHandler, true)
    document.addEventListener('keydown', this.docKeyHandler, true)
    document.addEventListener('mousemove', this.docMoveHighlightHandler, true)
    document.body.classList.add('teb-feedback-active')
    this.injectBodyCursorStyle()
  }

  private detachListeners(): void {
    if (typeof document === 'undefined') return
    if (this.docClickHandler) document.removeEventListener('click', this.docClickHandler, true)
    if (this.docKeyHandler) document.removeEventListener('keydown', this.docKeyHandler, true)
    if (this.docMoveHighlightHandler)
      document.removeEventListener('mousemove', this.docMoveHighlightHandler, true)
    this.docClickHandler = null
    this.docKeyHandler = null
    this.docMoveHighlightHandler = null
    document.body.classList.remove('teb-feedback-active')
  }

  private injectBodyCursorStyle(): void {
    if (typeof document === 'undefined') return
    const styleId = 'teb-page-cursor-style'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    const cursor = this.opts.feedbackCursor ?? 'crosshair'
    style.textContent = `body.teb-feedback-active, body.teb-feedback-active * { cursor: ${cursor} !important; }`
    document.head.appendChild(style)
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (this.mode.kind === 'idle') return
    if (this.shouldIgnoreClick(e)) return
    // Click landed inside our shadow root: composedPath check above
    // already handled it, but keep this belt-and-suspenders early-return
    // for the synthetic retargeted target case.
    if (e.target === this.host) return
    // Block the host page from receiving this click.
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    if (this.mode.kind === 'viewing') {
      // Clicking off a viewed pin -> close it. Don't open a new compose.
      this.mode = { kind: 'active' }
      this.render()
      return
    }
    if (this.mode.kind === 'composing-new') {
      // Clicking off an in-progress compose -> cancel it.
      this.cancelCompose()
      return
    }
    const target = e.target instanceof Element ? e.target : null
    if (!target) return
    const anchor = captureRouteAnchor(target)
    const rect = target.getBoundingClientRect()
    const vx = rect.right - 18
    const vy = rect.top - 18
    this.mode = { kind: 'composing-new', anchor, vx, vy, target }
    this.composeValue = ''
    this.composeEmail = ''
    this.render()
    queueMicrotask(() => this.focusCompose())
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.mode.kind === 'idle') return
    if (e.key === 'Escape') {
      if (this.mode.kind === 'composing-new') {
        e.preventDefault()
        this.cancelCompose()
        return
      }
      if (this.mode.kind === 'viewing') {
        e.preventDefault()
        this.mode = { kind: 'active' }
        this.render()
        return
      }
    }
  }

  private handleHoverMove(e: MouseEvent): void {
    if (this.mode.kind !== 'active') {
      this.clearHover()
      return
    }
    const target = e.target instanceof Element ? e.target : null
    if (!target || target === this.host || target === document.body) {
      this.clearHover()
      return
    }
    // Suppress the highlight when hovering the bug button / known floating
    // launchers; those are not "page" targets the reporter can pin.
    if (this.shouldIgnoreClick(e)) {
      this.clearHover()
      return
    }
    if (this.currentHover === target) return
    this.clearHover()
    this.currentHover = target
    this.paintHover(target)
  }

  private paintHover(target: Element): void {
    if (!this.shadow) return
    const rect = target.getBoundingClientRect()
    const box = this.shadow.querySelector<HTMLElement>('.teb-hover-box')
    if (!box) return
    box.style.left = `${rect.left}px`
    box.style.top = `${rect.top}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
    box.style.opacity = '1'
  }

  private clearHover(): void {
    this.currentHover = null
    if (!this.shadow) return
    const box = this.shadow.querySelector<HTMLElement>('.teb-hover-box')
    if (box) box.style.opacity = '0'
  }

  private isComposeUI(e: MouseEvent): boolean {
    // Walk the composedPath; if any node is our shadow host, the click is
    // inside the widget UI and should not be treated as a page click.
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    for (const node of path) {
      if (node === this.host) return true
    }
    return false
  }

  /**
   * Should this click NOT be treated as a "click on the page"? Covers:
   *   - clicks inside our own shadow root (compose / view card / pins)
   *   - clicks on the bug-button shadow host (so re-clicking the button
   *     toggles feedback mode off, instead of dropping a pin pointing at
   *     the button)
   *   - clicks on any host-supplied ignore-id (e.g. another chat launcher
   *     or floating widget on the host page)
   */
  private shouldIgnoreClick(e: MouseEvent): boolean {
    if (this.isComposeUI(e)) return true
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    const ignoreIds = new Set<string>([BUG_BUTTON_HOST_ID])
    for (const id of this.opts.ignoreHostIds ?? []) ignoreIds.add(id)
    for (const node of path) {
      if (node instanceof Element && node.id && ignoreIds.has(node.id)) {
        return true
      }
    }
    return false
  }

  private startRaf(): void {
    if (this.rafId !== null) return
    const tick = () => {
      this.updatePinPositions()
      if (this.mode.kind === 'composing-new' && this.mode.target) {
        const r = this.mode.target.getBoundingClientRect()
        this.mode.vx = r.right - 18
        this.mode.vy = r.top - 18
        this.repositionCompose()
      }
      if (this.mode.kind === 'active' && this.currentHover) {
        this.paintHover(this.currentHover)
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopRaf(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private updatePinPositions(): void {
    if (!this.shadow) return
    for (const pin of this.pins.values()) {
      const el = this.shadow.querySelector<HTMLElement>(`[${ATTR_PIN}="${pin.id}"]`)
      if (!el) continue
      const target = pin.target ?? resolveTarget(pin.annotation.anchor)
      if (target !== pin.target) pin.target = target
      const rect = target?.getBoundingClientRect?.()
      if (rect && rect.width > 0 && rect.height > 0) {
        pin.vx = rect.right - 18
        pin.vy = rect.top - 18
        el.style.transform = `translate(${pin.vx}px, ${pin.vy}px)`
        el.classList.remove('teb-pin-stale')
      } else {
        el.classList.add('teb-pin-stale')
      }
    }
  }

  private cancelCompose(): void {
    this.mode = { kind: 'active' }
    this.composeValue = ''
    this.composeEmail = ''
    this.composeKind = null
    this.render()
  }

  private async submitCompose(): Promise<void> {
    if (this.mode.kind !== 'composing-new') return
    const body = this.composeValue.trim()
    if (!body) return
    const anchor = this.mode.anchor
    const environment = captureEnvironment() ?? undefined
    const kind = this.composeKind
    const input: CreateInput = {
      anchor,
      body,
      ...(environment ? { environment } : {}),
      ...(kind ? { kind } : {}),
    }
    try {
      const created = await this.opts.api.create(input)
      try {
        this.opts.onCreate?.(created)
      } catch {
        // Host callback threw; do not block the create.
      }
      this.composeValue = ''
      this.composeEmail = ''
      this.composeKind = null
      this.mode = { kind: 'active' }
      await this.refresh()
    } catch (err) {
      // Surface error inline so the reporter sees something went wrong.
      this.renderError(err instanceof Error ? err.message : 'Create failed')
    }
  }

  private renderError(msg: string): void {
    if (!this.shadow) return
    const node = this.shadow.querySelector<HTMLElement>('.teb-compose-error')
    if (node) {
      node.textContent = msg
      node.style.opacity = '1'
    }
  }

  private focusCompose(): void {
    if (!this.shadow) return
    const ta = this.shadow.querySelector<HTMLTextAreaElement>('.teb-compose-textarea')
    ta?.focus()
  }

  private repositionCompose(): void {
    if (!this.shadow) return
    if (this.mode.kind !== 'composing-new' && this.mode.kind !== 'viewing') return
    const card = this.shadow.querySelector<HTMLElement>('.teb-card')
    if (!card) return
    const vx = this.mode.kind === 'composing-new' ? this.mode.vx : this.mode.pin.vx
    const vy = this.mode.kind === 'composing-new' ? this.mode.vy : this.mode.pin.vy
    const placement = pickCardPlacement(vx, vy, card.offsetWidth, card.offsetHeight)
    card.style.left = `${placement.x}px`
    card.style.top = `${placement.y}px`
  }

  /* ------------------------------ render ------------------------------ */

  private render(): void {
    if (!this.shadow) return
    const root = this.shadow.querySelector<HTMLElement>('.teb-root')
    if (!root) return
    const active = this.mode.kind !== 'idle'
    root.classList.toggle('teb-active', active)
    root.innerHTML = ''
    // Hover highlight box (only meaningful while feedback mode is armed).
    const hoverBox = document.createElement('div')
    hoverBox.className = 'teb-hover-box'
    hoverBox.style.opacity = '0'
    root.appendChild(hoverBox)
    if (!active) return
    // Hint ribbon (only while feedback mode is armed AND no card is open).
    if (this.mode.kind === 'active' && (this.opts.showHint ?? true)) {
      const hint = document.createElement('div')
      hint.className = 'teb-hint'
      hint.setAttribute('role', 'status')
      hint.textContent = this.opts.hintText ?? 'Click any element to drop a note'
      root.appendChild(hint)
    }
    // Pins.
    for (const pin of this.pins.values()) {
      // Skip orphan pins entirely. Previously these stacked on the
      // viewport top-left as gray circles, which looked broken on any
      // page whose DOM had drifted since the pin was placed. The drawer
      // surfaces these notes in the list view by route; only the
      // on-page marker is dropped.
      if (!pin.target) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute(ATTR_PIN, pin.id)
      el.className = 'teb-pin'
      // Per-pin kind badge: color the pin background by kind so the
      // reporter can scan the page and see classification at a glance.
      // Unclassified pins keep the default accent (pink).
      const k = pin.annotation.kind
      if (k && (k === 'bug' || k === 'feature' || k === 'note')) {
        el.classList.add(`teb-pin-${k}`)
        el.dataset.kind = k
      }
      el.style.transform = `translate(${pin.vx}px, ${pin.vy}px)`
      const labelIdx = indexOf(this.items, pin.annotation) + 1
      el.textContent = `${labelIdx}`
      const kindSuffix = k ? ` (${k})` : ''
      el.setAttribute('aria-label', `Open feedback ${labelIdx}${kindSuffix}`)
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        this.mode = { kind: 'viewing', pin }
        this.render()
      })
      root.appendChild(el)
    }
    // Card: compose or view.
    if (this.mode.kind === 'composing-new') {
      root.appendChild(this.buildComposeCard())
    } else if (this.mode.kind === 'viewing') {
      root.appendChild(this.buildViewCard(this.mode.pin))
    }
  }

  private buildComposeCard(): HTMLElement {
    if (this.mode.kind !== 'composing-new') throw new Error('not composing')
    const card = document.createElement('div')
    card.className = 'teb-card teb-card-compose'
    card.addEventListener('click', (e) => e.stopPropagation())
    const placement = pickCardPlacement(this.mode.vx, this.mode.vy, 320, 280)
    card.style.left = `${placement.x}px`
    card.style.top = `${placement.y}px`

    const head = document.createElement('div')
    head.className = 'teb-card-head'
    head.innerHTML = `
      <span class="teb-card-eyebrow">New feedback</span>
      <button type="button" class="teb-card-close" aria-label="Cancel">×</button>
    `
    card.appendChild(head)
    head.querySelector('.teb-card-close')?.addEventListener('click', () => this.cancelCompose())

    const ta = document.createElement('textarea')
    ta.className = 'teb-compose-textarea'
    ta.placeholder = 'Describe what needs to change…'
    ta.value = this.composeValue
    ta.rows = 4
    ta.addEventListener('input', () => {
      this.composeValue = ta.value
    })
    ta.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault()
        void this.submitCompose()
      }
    })
    card.appendChild(ta)

    // Optional kind radios (bug / feature / note) + Clear. Match the
    // drawer's shape so reporters see the same classification UI on both
    // surfaces.
    const kindsRow = document.createElement('div')
    kindsRow.className = 'teb-kinds-row'
    kindsRow.setAttribute('role', 'radiogroup')
    kindsRow.setAttribute('aria-label', 'Optional classification')
    const radioInputs: HTMLInputElement[] = []
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'teb-kind-clear'
    clearBtn.textContent = 'Clear'
    clearBtn.hidden = !this.composeKind
    for (const k of ['bug', 'feature', 'note'] as const) {
      const label = document.createElement('label')
      label.className = 'teb-kind-pill'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'teb-page-kind'
      input.dataset.kind = k
      input.checked = this.composeKind === k
      input.addEventListener('change', () => {
        if (input.checked) {
          this.composeKind = k
          clearBtn.hidden = false
        }
      })
      const span = document.createElement('span')
      span.textContent = k.charAt(0).toUpperCase() + k.slice(1)
      label.appendChild(input)
      label.appendChild(span)
      kindsRow.appendChild(label)
      radioInputs.push(input)
    }
    clearBtn.addEventListener('click', () => {
      this.composeKind = null
      for (const r of radioInputs) r.checked = false
      clearBtn.hidden = true
    })
    kindsRow.appendChild(clearBtn)
    card.appendChild(kindsRow)

    const info = this.buildAdditionalInfo(this.mode.anchor)
    card.appendChild(info)

    const footer = document.createElement('div')
    footer.className = 'teb-card-footer'
    footer.innerHTML = `
      <span class="teb-compose-error" aria-live="polite"></span>
      <button type="button" class="teb-submit-btn">Drop pin</button>
    `
    card.appendChild(footer)
    footer.querySelector('.teb-submit-btn')?.addEventListener('click', () => {
      void this.submitCompose()
    })
    return card
  }

  private buildViewCard(pin: PinView): HTMLElement {
    const card = document.createElement('div')
    card.className = 'teb-card teb-card-view'
    card.addEventListener('click', (e) => e.stopPropagation())
    const placement = pickCardPlacement(pin.vx, pin.vy, 320, 280)
    card.style.left = `${placement.x}px`
    card.style.top = `${placement.y}px`

    const head = document.createElement('div')
    head.className = 'teb-card-head'
    const idx = indexOf(this.items, pin.annotation) + 1
    head.innerHTML = `
      <span class="teb-card-eyebrow">Feedback #${idx} · ${escapeHtml(pin.annotation.author.display)}</span>
      <button type="button" class="teb-card-close" aria-label="Close">×</button>
    `
    card.appendChild(head)
    head.querySelector('.teb-card-close')?.addEventListener('click', () => {
      this.mode = { kind: 'active' }
      this.render()
    })

    // Render the kind badge before the body if the annotation has one.
    // Adapters that don't persist Annotation.kind end up with undefined.
    const k = pin.annotation.kind
    if (k && (k === 'bug' || k === 'feature' || k === 'note')) {
      const badges = document.createElement('div')
      badges.className = 'teb-kind-badges'
      const badge = document.createElement('span')
      badge.className = `teb-kind-badge kind-${k}`
      badge.textContent = k
      badges.appendChild(badge)
      card.appendChild(badges)
    }

    const body = document.createElement('div')
    body.className = 'teb-view-body'
    body.textContent = pin.annotation.body
    card.appendChild(body)

    card.appendChild(this.buildAdditionalInfoFromAnnotation(pin.annotation))

    return card
  }

  private buildAdditionalInfo(anchor: AnnotationAnchor): HTMLElement {
    const env = captureEnvironment()
    const selector = anchor.mode === 'route' && anchor.selector ? anchor.selector : '(none)'
    const rows: Array<[string, string]> = [
      ['Task logged at', env?.url ?? '(unknown)'],
      ['Operating system', env?.os ?? '(unknown)'],
      ['Browser', env?.browser ? `${env.browser} ${env.browserVersion}` : '(unknown)'],
      ['Selector', selector],
      ['Resolution', env ? `${env.screenW} x ${env.screenH} px` : '(unknown)'],
      ['Browser window', env ? `${env.windowW} x ${env.windowH} px` : '(unknown)'],
      ['Color depth', env ? `${env.colorDepth} bit` : '(unknown)'],
    ]
    return renderInfoBlock('Additional Info', rows)
  }

  private buildAdditionalInfoFromAnnotation(a: Annotation): HTMLElement {
    const env = a.environment
    const selector = a.anchor.mode === 'route' && a.anchor.selector ? a.anchor.selector : '(none)'
    const rows: Array<[string, string]> = [
      ['Task logged at', env?.url ?? '(unknown)'],
      ['Operating system', env?.os ?? '(unknown)'],
      ['Browser', env?.browser ? `${env.browser} ${env.browserVersion}` : '(unknown)'],
      ['Selector', selector],
      ['Resolution', env ? `${env.screenW} x ${env.screenH} px` : '(unknown)'],
      ['Browser window', env ? `${env.windowW} x ${env.windowH} px` : '(unknown)'],
      ['Color depth', env ? `${env.colorDepth} bit` : '(unknown)'],
    ]
    return renderInfoBlock('Additional Info', rows)
  }

  private buildStyles(): HTMLStyleElement {
    const style = document.createElement('style')
    style.textContent = STYLE_TEXT
    return style
  }
}

/* -------------------------- pure helpers below -------------------------- */

/**
 * Resolve a route-anchored pin to a live DOM element. Tries four
 * strategies in order; first hit wins. Hosts get pin durability across
 * DOM rebuilds whose CSS class churn would otherwise orphan the pin.
 *
 *   1. CSS selector (@medv/finder shortest unique). Fast, fragile to
 *      class churn from utility-first frameworks (Tailwind, etc.).
 *   2. XPath. Survives class churn that breaks (1), still requires the
 *      structural shape to be preserved.
 *   3. textQuote (W3C-style exact + prefix/suffix). Survives selector
 *      AND structural churn as long as the labeled text is still on the
 *      page. Disambiguates with prefix/suffix when multiple matches.
 *   4. Viewport coordinates (last resort). Use the stored
 *      getBoundingClientRect center and ask the browser what's at that
 *      position today. Loses precision when the page has scrolled or
 *      rearranged; still gives the pin a meaningful home rather than
 *      orphaning it.
 *
 * Hosts that want auto-healing can update the stored anchor when a
 * non-(1) strategy resolves; see resolveTargetForAnchor's return shape.
 */
function resolveTarget(anchor: AnnotationAnchor): Element | null {
  return resolveTargetForAnchor(anchor).target
}

export type ResolveResult = {
  target: Element | null
  /** Which strategy resolved the target; null when none did. */
  via: 'selector' | 'xpath' | 'textQuote' | 'viewport' | null
}

export function resolveTargetForAnchor(anchor: AnnotationAnchor): ResolveResult {
  if (typeof document === 'undefined') return { target: null, via: null }
  if (anchor.mode !== 'route') return { target: null, via: null }
  // Pre-resolve every available signal so we can cross-check them.
  // Selectors generated by @medv/finder often consist of utility classes
  // (Tailwind), which match dozens of elements across the page. When the
  // selector matches more than one node, first-match-wins gives the
  // wrong target on rebuilds. The fix: gather all candidates, then use
  // xpath / textQuote / viewport to disambiguate.
  let selectorMatches: Element[] = []
  if (anchor.selector) {
    try {
      selectorMatches = Array.from(document.querySelectorAll(anchor.selector))
    } catch {
      selectorMatches = []
    }
  }
  if (selectorMatches.length === 1) {
    return { target: selectorMatches[0] ?? null, via: 'selector' }
  }

  let xpathMatch: Element | null = null
  if (anchor.xpath) {
    try {
      const result = document.evaluate(
        anchor.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      )
      const node = result.singleNodeValue
      if (node instanceof Element) xpathMatch = node
    } catch {
      xpathMatch = null
    }
  }
  // If selector found multiple candidates AND xpath resolved, prefer
  // the xpath element when it's among the candidates (strongest signal).
  // If xpath resolves outside the candidate set, still prefer xpath
  // since it represents the exact stored structural path.
  if (xpathMatch) return { target: xpathMatch, via: 'xpath' }

  // No xpath match. If selector found multiple, disambiguate by text /
  // viewport. Otherwise (no candidates at all) try text / viewport from
  // scratch.
  const textMatch = anchor.textQuote?.exact
    ? findByTextQuote(anchor.textQuote.exact, anchor.textQuote.prefix, anchor.textQuote.suffix)
    : null
  if (textMatch) {
    if (selectorMatches.length === 0 || selectorMatches.includes(textMatch)) {
      return { target: textMatch, via: 'textQuote' }
    }
    // textMatch outside selector candidates: still useful, prefer text.
    return { target: textMatch, via: 'textQuote' }
  }
  if (selectorMatches.length > 1) {
    // No text disambiguator; refuse to guess from selector candidates.
    // Fall to viewport.
  }
  if (anchor.viewport) {
    const el = findByViewportCenter(anchor.viewport)
    if (el) {
      // If viewport hits a selector candidate, that's a confident match;
      // otherwise it's a coordinate-only guess (still better than orphan).
      return { target: el, via: 'viewport' }
    }
  }
  return { target: null, via: null }
}

/**
 * Find the smallest element whose normalized text content contains
 * `exact`. If multiple candidates match, the prefix/suffix from the
 * original capture disambiguate by checking the parent text context.
 *
 * Walks every text node in the document. Bounded by node count not
 * tree depth so it stays linear in document size. Cheap enough to run
 * once per pin on render; if a host has hundreds of pins per page,
 * consider memoizing the text-node walk per route change.
 */
function findByTextQuote(exact: string, prefix?: string, suffix?: string): Element | null {
  if (!exact || typeof document === 'undefined') return null
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const needle = normalize(exact)
  if (!needle) return null

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const candidates: Element[] = []
  let node = walker.nextNode()
  while (node) {
    const text = normalize(node.nodeValue || '')
    if (text.includes(needle)) {
      const parent = node.parentElement
      if (parent && !candidates.includes(parent)) candidates.push(parent)
    }
    node = walker.nextNode()
  }
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0] ?? null

  // Multiple matches: pick the one whose normalized parent text best
  // matches the original prefix+exact+suffix neighborhood. Score by
  // how many of prefix / suffix substrings appear in the same parent.
  let best: { el: Element; score: number } | null = null
  for (const el of candidates) {
    const parentText = normalize(el.textContent || '')
    let score = 0
    if (prefix && parentText.includes(normalize(prefix))) score += 2
    if (suffix && parentText.includes(normalize(suffix))) score += 2
    if (!best || score > best.score) best = { el, score }
  }
  return best ? best.el : (candidates[0] ?? null)
}

/**
 * Last-resort fallback: use the stored bounding rect to ask the browser
 * what element is at that viewport position today. Only useful when the
 * page is at a similar scroll position as when the pin was dropped, but
 * a "wrong-but-near" pin reads as less broken than a hidden one.
 */
function findByViewportCenter(viewport: {
  x: number
  y: number
  w: number
  h: number
}): Element | null {
  if (typeof document === 'undefined') return null
  if (typeof document.elementFromPoint !== 'function') return null
  const cx = viewport.x + viewport.w / 2
  const cy = viewport.y + viewport.h / 2
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  const el = document.elementFromPoint(cx, cy)
  if (!el) return null
  // Skip our own shadow hosts so a pin doesn't anchor to the bug button
  // or the page-mode overlay.
  if (el.id === 'travisEATSbugs-host' || el.id === 'travisEATSbugs-page-host') {
    return null
  }
  if (el.id === 'travisEATSbugs-drawer-host') return null
  return el
}

function pickCardPlacement(
  pinVx: number,
  pinVy: number,
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  const margin = 12
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const winH = typeof window !== 'undefined' ? window.innerHeight : 720
  // Prefer right side of the pin, then left, then below.
  let x = pinVx + 32
  let y = pinVy - 8
  if (x + cardW + margin > winW) {
    x = pinVx - cardW - 32
  }
  if (x < margin) x = margin
  if (y + cardH + margin > winH) {
    y = winH - cardH - margin
  }
  if (y < margin) y = margin
  return { x, y }
}

function indexOf(items: Annotation[], a: Annotation): number {
  return items.findIndex((x) => x.id === a.id)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function renderInfoBlock(title: string, rows: Array<[string, string]>): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'teb-info'
  const head = document.createElement('div')
  head.className = 'teb-info-head'
  head.textContent = title
  wrap.appendChild(head)
  const table = document.createElement('dl')
  table.className = 'teb-info-table'
  for (const [k, v] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = v
    dd.title = v
    table.appendChild(dt)
    table.appendChild(dd)
  }
  wrap.appendChild(table)
  return wrap
}

const STYLE_TEXT = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
}

.teb-root {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
}

.teb-root.teb-active .teb-pin,
.teb-root.teb-active .teb-card {
  pointer-events: auto;
}

.teb-hover-box {
  position: fixed;
  pointer-events: none;
  border: 2px dashed rgba(255, 42, 109, 0.85);
  background: rgba(255, 42, 109, 0.08);
  border-radius: 4px;
  transition: opacity 120ms cubic-bezier(0.45, 0, 0.55, 1);
  z-index: 1;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.teb-hint {
  position: fixed;
  bottom: 84px;
  right: 22px;
  background: #0c0908;
  color: #fcf6ec;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  font-weight: 500;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(252, 246, 236, 0.08);
  pointer-events: none;
  z-index: 4;
  animation: teb-hint-pop 240ms cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}
.teb-hint::after {
  content: '';
  position: absolute;
  bottom: -4px;
  right: 18px;
  width: 8px;
  height: 8px;
  background: #0c0908;
  transform: rotate(45deg);
  border-radius: 1px;
}

@keyframes teb-hint-pop {
  from { transform: translateY(4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.teb-pin {
  position: fixed;
  top: 0;
  left: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #fcf6ec;
  background: #ff2a6d;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.22),
    0 0 0 0 rgba(255, 42, 109, 0.45);
  transition:
    transform 160ms cubic-bezier(0.45, 0, 0.55, 1),
    box-shadow 280ms cubic-bezier(0.45, 0, 0.55, 1);
  z-index: 2;
  will-change: transform;
}

.teb-pin:hover {
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.28),
    0 0 0 8px rgba(255, 42, 109, 0.25);
}

/* Per-kind pin coloring. Order matters: stale class must come AFTER
 * these so a stale pin (broken selector) shows gray regardless of
 * its kind classification. */
.teb-pin-bug { background: #c43932; }
.teb-pin-bug:hover {
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.28),
    0 0 0 8px rgba(196, 57, 50, 0.25);
}
.teb-pin-feature { background: #3b82f6; }
.teb-pin-feature:hover {
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.28),
    0 0 0 8px rgba(59, 130, 246, 0.25);
}
.teb-pin-note { background: #64748b; }
.teb-pin-note:hover {
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.28),
    0 0 0 8px rgba(100, 116, 139, 0.25);
}

/* Orphan pins (selector no longer resolves in the live DOM) used to stack
 * vertically on the left edge as gray circles, which read as broken on any
 * page that's been refactored since the pins were dropped. Hide them outright.
 * The drawer-list view still surfaces every note for the route regardless of
 * anchor resolution, so the data isn't lost — only the on-page pin marker
 * disappears when its target is gone. */
.teb-pin-stale {
  display: none !important;
}

.teb-card {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  background: #fcf6ec;
  color: #0c0908;
  border-radius: 10px;
  border: 1px solid rgba(12, 9, 8, 0.12);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(12, 9, 8, 0.05);
  padding: 14px 14px 12px;
  z-index: 3;
  font-size: 0.92rem;
  line-height: 1.5;
  transform-origin: top left;
  animation: teb-card-pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes teb-card-pop {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.teb-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.teb-card-eyebrow {
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(12, 9, 8, 0.6);
}

.teb-card-close {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: rgba(12, 9, 8, 0.6);
  font-size: 1.1rem;
  cursor: pointer;
}
.teb-card-close:hover { background: rgba(12, 9, 8, 0.08); color: #0c0908; }

.teb-compose-textarea {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  border: 1px solid rgba(12, 9, 8, 0.18);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  background: #fffaf0;
  color: inherit;
  box-sizing: border-box;
  outline: none;
}
.teb-compose-textarea:focus {
  border-color: #ff2a6d;
  box-shadow: 0 0 0 3px rgba(255, 42, 109, 0.18);
}

.teb-kinds-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.teb-kind-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 7px;
  border-radius: 999px;
  background: #fffaf0;
  border: 1px solid rgba(12, 9, 8, 0.18);
  font-size: 11px;
  line-height: 1.4;
  color: rgba(12, 9, 8, 0.62);
  cursor: pointer;
  user-select: none;
  transition: background 160ms cubic-bezier(0.45, 0, 0.55, 1), color 160ms cubic-bezier(0.45, 0, 0.55, 1);
}
.teb-kind-pill input { margin: 0; cursor: pointer; }
.teb-kind-pill:has(input:checked) {
  background: #ff2a6d;
  color: #fff;
  border-color: transparent;
}
.teb-kind-clear {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  color: rgba(12, 9, 8, 0.55);
  font-size: 11px;
  line-height: 1.4;
  padding: 3px 7px;
  border-radius: 999px;
  cursor: pointer;
  text-decoration: underline;
}
.teb-kind-clear:hover { color: #0c0908; }
.teb-kind-clear:focus-visible {
  outline: 2px solid #0c0908;
  outline-offset: 2px;
}
.teb-kind-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.teb-kind-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.teb-kind-badge.kind-bug { background: rgba(196, 57, 50, 0.14); color: #c43932; }
.teb-kind-badge.kind-feature { background: rgba(59, 130, 246, 0.14); color: #3b82f6; }
.teb-kind-badge.kind-note { background: rgba(148, 163, 184, 0.16); color: rgba(12, 9, 8, 0.6); }

.teb-view-body {
  background: #fffaf0;
  border: 1px solid rgba(12, 9, 8, 0.12);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.teb-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.teb-compose-error {
  font-size: 0.78rem;
  color: #c1184d;
  opacity: 0;
  transition: opacity 200ms cubic-bezier(0.45, 0, 0.55, 1);
}

.teb-submit-btn {
  background: #0c0908;
  color: #fcf6ec;
  border: 0;
  border-radius: 6px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms cubic-bezier(0.45, 0, 0.55, 1),
    transform 80ms cubic-bezier(0.45, 0, 0.55, 1);
}
.teb-submit-btn:hover { background: #1f1c1a; }
.teb-submit-btn:active { transform: scale(0.97); }

.teb-info {
  margin-top: 10px;
  border-top: 1px solid rgba(12, 9, 8, 0.08);
  padding-top: 10px;
}

.teb-info-head {
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(12, 9, 8, 0.55);
  margin-bottom: 6px;
}

.teb-info-table {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 4px 10px;
  margin: 0;
  font-size: 0.82rem;
}
.teb-info-table dt {
  color: rgba(12, 9, 8, 0.55);
  margin: 0;
}
.teb-info-table dd {
  margin: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: #0c0908;
}

@media (prefers-reduced-motion: reduce) {
  .teb-card,
  .teb-pin,
  .teb-hover-box,
  .teb-submit-btn {
    animation: none !important;
    transition: none !important;
  }
}
`
