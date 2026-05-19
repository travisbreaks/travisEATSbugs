/**
 * Drawer render mode.
 *
 * Shadow-DOM-isolated floating panel that:
 *   - Lists annotations for the current route
 *   - Compose textarea with Cmd/Ctrl+Enter submit
 *   - Per-item edit / delete / resolve / reopen actions
 *   - Optimistic clear-on-submit (avoids the double-submit race)
 *   - Refocus textarea after save (so consecutive notes work)
 *   - prefers-reduced-motion kills slide animation
 *
 * The widget owns no I/O: every mutation goes through the ApiAdapter passed in.
 *
 * See docs/architecture.md for the drawer UX rationale and docs/design.md
 * §"Non-negotiable rules" for the motion + accessibility contract.
 */

import type { ApiAdapter, AuthAdapter, ThemeAdapter } from './adapters'
import { setReporterName } from './reporter'
import { onRouteChange } from './route-watcher'
import type { AnchorQuery, Annotation, AnnotationKind, AuthorRef } from './types'

export type ReporterPromptConfig = {
  /** localStorage namespace for the stored reporter identity. */
  namespace?: string
  /** Prompt text shown above the name input. */
  prompt?: string
  /** Input placeholder. */
  placeholder?: string
  /** CTA button label. */
  submitLabel?: string
}

export type DrawerOpts = {
  api: ApiAdapter
  auth?: AuthAdapter
  theme?: ThemeAdapter
  /**
   * Anchor query used to scope the drawer's list call. Defaults to
   * `{ mode: 'route', path: window.location.pathname }`. Pass an explicit
   * query for tests or for surfaces that aren't route-scoped.
   */
  anchorQuery?: () => AnchorQuery
  position?: { bottom: number; right: number }
  /**
   * If true, render the drawer as initially open. Default false; consumers
   * usually toggle via the floating bug button.
   */
  open?: boolean
  /**
   * Reporter mode: when `auth.getCurrentUser()` returns null, prompt for
   * a display name before allowing compose. Name persists to localStorage
   * via the namespace below.
   */
  reporterPrompt?: ReporterPromptConfig
}

const HOST_ID = 'travisEATSbugs-drawer-host'

export class AnnotationDrawer {
  private opts: DrawerOpts
  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null
  private isOpen: boolean
  private isMounted = false
  private composeValue = ''
  private editingId: string | null = null
  private editingValue = ''
  private items: Annotation[] = []
  private loading = false
  private awaitingReporter = false
  private reporterChecked = false
  private unsubscribeRoute: (() => void) | null = null
  // Reporter-supplied single classification for the next compose.
  // Optional; null = no classification (brain-dump path). Reset to null
  // after a successful submit so the reporter has to re-pick for the
  // next note (avoids accidental persisted classification carry-over).
  private composeKind: AnnotationKind | null = null
  // List-view filter on persisted Annotation.kind. 'all' shows every item
  // (including unclassified). Per-kind values filter to that kind only.
  // 'unclassified' covers items that came in without a kind set, useful
  // when an inbox grows beyond a couple dozen pre-classification notes.
  private listFilter: AnnotationKind | 'all' | 'unclassified' = 'all'

  constructor(opts: DrawerOpts) {
    this.opts = opts
    this.isOpen = opts.open ?? false
  }

  mount(): void {
    if (this.isMounted) return
    if (typeof document === 'undefined') return
    this.isMounted = true
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.appendChild(this.buildStyles())
    this.shadow.appendChild(this.buildPanel())
    document.body.appendChild(this.host)
    // Re-fetch on soft navigation. Default anchorQuery reads
    // window.location.pathname at call time, so a refresh after the URL
    // has changed pulls the new page's list. Fixes the 2026-05-18
    // regression where notes from page A stayed visible on page B.
    this.unsubscribeRoute = onRouteChange(() => {
      // Cancel any open compose against the OLD page so the typed text
      // doesn't get attached to the new route's anchor.
      this.editingId = null
      this.composeValue = ''
      this.refresh()
    })
    void this.checkReporter()
    this.refresh()
  }

  /**
   * If reporter mode is enabled and the host auth adapter returns no
   * current user, flip into reporter-prompt state. Called on mount and
   * before any compose attempt.
   */
  private async checkReporter(): Promise<void> {
    if (!this.opts.reporterPrompt || !this.opts.auth) {
      this.reporterChecked = true
      return
    }
    try {
      const user = await this.opts.auth.getCurrentUser()
      this.awaitingReporter = user === null
    } catch {
      // Auth threw; default to "no reporter" so the prompt shows. Host
      // can wire their own error UI later.
      this.awaitingReporter = true
    }
    this.reporterChecked = true
    this.render()
  }

  unmount(): void {
    if (!this.isMounted) return
    if (this.unsubscribeRoute) {
      this.unsubscribeRoute()
      this.unsubscribeRoute = null
    }
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host)
    this.host = null
    this.shadow = null
    this.isMounted = false
  }

  open(): void {
    this.isOpen = true
    this.render()
    void this.refresh()
  }

  close(): void {
    this.isOpen = false
    this.render()
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  isOpenState(): boolean {
    return this.isOpen
  }

  refresh(): void {
    void this.load()
  }

  private async load(): Promise<void> {
    if (!this.isMounted) return
    this.loading = true
    this.render()
    try {
      const query = this.resolveAnchorQuery()
      this.items = await this.opts.api.list({ anchor: query, state: 'all' })
    } catch {
      this.items = []
    } finally {
      this.loading = false
      this.render()
    }
  }

  private resolveAnchorQuery(): AnchorQuery {
    if (this.opts.anchorQuery) return this.opts.anchorQuery()
    const path = typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
    return { mode: 'route', path }
  }

  private buildStyles(): HTMLStyleElement {
    const bottom = this.opts.position?.bottom ?? 88
    const right = this.opts.position?.right ?? 20
    const style = document.createElement('style')
    style.textContent = `
      :host {
        --teb-surface-1: #ffffff;
        --teb-surface-2: #f6f6f7;
        --teb-fg: #0c0908;
        --teb-muted: #6c6a68;
        --teb-border: rgba(0, 0, 0, 0.08);
        --teb-accent: #ff2a6d;
        --teb-success: #2a9d57;
        --teb-danger: #c43932;
        --teb-z: 2147483646;
        --teb-radius: 14px;
        --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);
        --teb-ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);

        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: var(--teb-fg);
      }

      .panel {
        position: fixed;
        bottom: ${bottom}px;
        right: ${right}px;
        width: min(420px, calc(100vw - 32px));
        max-height: min(70vh, 640px);
        background: var(--teb-surface-1);
        border: 1px solid var(--teb-border);
        border-radius: var(--teb-radius);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
        z-index: var(--teb-z);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform-origin: bottom right;
        transform: translateY(8px) scale(0.98);
        opacity: 0;
        pointer-events: none;
        transition:
          transform 280ms var(--teb-ease-entrance),
          opacity 220ms var(--teb-ease-entrance);
      }

      :host([data-open='true']) .panel,
      .panel[data-open='true'] {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: auto;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--teb-border);
        background: var(--teb-surface-2);
      }

      .title {
        font-weight: 600;
        font-size: 14px;
      }

      .close-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--teb-muted);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 18px;
        line-height: 1;
        transition: background 160ms var(--teb-ease);
      }
      .close-btn:hover { background: rgba(0,0,0,0.04); }
      .close-btn:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }

      .compose {
        padding: 12px 16px;
        border-bottom: 1px solid var(--teb-border);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .compose[hidden] { display: none; }

      .reporter-prompt {
        padding: 16px;
        border-bottom: 1px solid var(--teb-border);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .reporter-prompt[hidden] { display: none; }
      .reporter-label {
        font-size: 13px;
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

      textarea {
        width: 100%;
        min-height: 64px;
        max-height: 200px;
        resize: vertical;
        font: inherit;
        color: inherit;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 8px;
        padding: 8px 10px;
        box-sizing: border-box;
      }
      textarea:focus-visible {
        outline: 2px solid var(--teb-accent);
        outline-offset: 1px;
      }

      .compose-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .hint {
        font-size: 11px;
        color: var(--teb-muted);
      }

      .btn {
        font: inherit;
        color: inherit;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 8px;
        padding: 6px 12px;
        cursor: pointer;
        min-height: 32px;
        transition:
          transform 200ms var(--teb-ease),
          background 160ms var(--teb-ease);
      }
      .btn:hover { transform: scale(1.02); }
      .btn:active { transform: scale(0.97); transition: transform 80ms var(--teb-ease); }
      .btn:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }
      .btn.primary {
        background: var(--teb-accent);
        color: #fff;
        border-color: transparent;
      }
      .btn.primary:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
      }
      .btn.ghost {
        background: transparent;
        border-color: transparent;
        color: var(--teb-muted);
      }

      .list {
        list-style: none;
        margin: 0;
        padding: 4px 0 8px;
        overflow-y: auto;
        flex: 1 1 auto;
      }

      .item {
        padding: 12px 16px;
        border-bottom: 1px solid var(--teb-border);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .item:last-child { border-bottom: none; }

      .item-head {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--teb-muted);
      }
      .item-body {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .item.resolved .item-body {
        color: var(--teb-muted);
      }
      .item-actions {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.4;
      }
      .badge.resolved { background: rgba(42, 157, 87, 0.12); color: var(--teb-success); }
      .badge.dup { background: rgba(196, 57, 50, 0.10); color: var(--teb-danger); }

      .kinds-row {
        display: flex;
        gap: 6px;
        margin-top: 6px;
        flex-wrap: wrap;
      }
      .kind-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 9px 3px 7px;
        border-radius: 999px;
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        font-size: 11px;
        line-height: 1.4;
        color: var(--teb-muted);
        cursor: pointer;
        user-select: none;
        transition: background 160ms var(--teb-ease), color 160ms var(--teb-ease);
      }
      .kind-pill input { margin: 0; cursor: pointer; }
      .kind-pill:has(input:checked) {
        background: var(--teb-accent);
        color: #fff;
        border-color: transparent;
      }
      .kind-pill input:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }
      .kind-clear {
        appearance: none;
        background: transparent;
        border: 1px solid transparent;
        color: var(--teb-muted);
        font-size: 11px;
        line-height: 1.4;
        padding: 3px 7px;
        border-radius: 999px;
        cursor: pointer;
        text-decoration: underline;
      }
      .kind-clear:hover { color: var(--teb-fg); }
      .kind-clear:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }

      .kind-badges {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .badge.kind-bug { background: rgba(196, 57, 50, 0.12); color: var(--teb-danger); }
      .badge.kind-feature { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
      .badge.kind-note { background: rgba(148, 163, 184, 0.14); color: var(--teb-muted); }

      .list-filter {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        padding: 8px 16px;
        border-bottom: 1px solid var(--teb-border);
        background: var(--teb-surface-1);
      }
      .list-filter[hidden] { display: none; }
      .filter-pill {
        appearance: none;
        font: inherit;
        font-size: 11px;
        line-height: 1.4;
        color: var(--teb-muted);
        background: var(--teb-surface-2);
        border: 1px solid var(--teb-border);
        border-radius: 999px;
        padding: 3px 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background 160ms var(--teb-ease), color 160ms var(--teb-ease);
      }
      .filter-pill:hover { background: rgba(0, 0, 0, 0.04); color: var(--teb-fg); }
      .filter-pill.is-active {
        background: var(--teb-accent);
        color: #fff;
        border-color: transparent;
      }
      .filter-pill.is-active:hover { background: var(--teb-accent); }
      .filter-pill:focus-visible {
        outline: 2px solid var(--teb-fg);
        outline-offset: 2px;
      }
      .filter-count {
        font-variant-numeric: tabular-nums;
        font-size: 10px;
        background: rgba(0, 0, 0, 0.06);
        padding: 1px 6px;
        border-radius: 999px;
      }
      .filter-pill.is-active .filter-count {
        background: rgba(255, 255, 255, 0.22);
      }

      .empty {
        padding: 24px 16px;
        text-align: center;
        color: var(--teb-muted);
        font-size: 13px;
      }

      .footer {
        padding: 8px 16px;
        border-top: 1px solid var(--teb-border);
        background: var(--teb-surface-2);
        font-size: 11px;
        color: var(--teb-muted);
      }

      @media (prefers-reduced-motion: reduce) {
        .panel { transition: none !important; transform: none !important; }
        .btn:hover, .btn:active { transform: none; transition: none; }
      }
    `
    return style
  }

  private buildPanel(): HTMLDivElement {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', this.opts.theme?.drawerTitle ?? 'Page notes')
    panel.dataset.open = String(this.isOpen)
    const reporterPrompt =
      this.opts.reporterPrompt?.prompt ?? 'What name should we put on your notes?'
    const reporterPlaceholder = this.opts.reporterPrompt?.placeholder ?? 'Your name'
    const reporterSubmit = this.opts.reporterPrompt?.submitLabel ?? 'Continue'
    panel.innerHTML = `
      <div class="header">
        <span class="title"></span>
        <button class="close-btn" type="button" aria-label="Close panel">×</button>
      </div>
      <div class="reporter-prompt" hidden>
        <label class="reporter-label">${reporterPrompt}</label>
        <div class="reporter-row">
          <input
            class="reporter-input"
            type="text"
            aria-label="Your display name"
            placeholder="${reporterPlaceholder}"
            maxlength="60"
          />
          <button class="btn primary reporter-submit-btn" type="button">${reporterSubmit}</button>
        </div>
      </div>
      <div class="compose">
        <textarea
          aria-label="Compose note"
          placeholder="Leave a note about this page..."
          rows="3"
        ></textarea>
        <div class="kinds-row" role="radiogroup" aria-label="Optional classification">
          <label class="kind-pill"><input type="radio" name="teb-kind" data-kind="bug" /><span>Bug</span></label>
          <label class="kind-pill"><input type="radio" name="teb-kind" data-kind="feature" /><span>Feature</span></label>
          <label class="kind-pill"><input type="radio" name="teb-kind" data-kind="note" /><span>Note</span></label>
          <button type="button" class="kind-clear" hidden>Clear</button>
        </div>
        <div class="compose-row">
          <span class="hint">Cmd/Ctrl + Enter to send</span>
          <button class="btn primary submit-btn" type="button">Send</button>
        </div>
      </div>
      <div class="list-filter" role="tablist" aria-label="Filter by classification">
        <button type="button" class="filter-pill" role="tab" data-filter="all" aria-selected="true">All <span class="filter-count" data-count-for="all">0</span></button>
        <button type="button" class="filter-pill" role="tab" data-filter="bug" aria-selected="false">Bug <span class="filter-count" data-count-for="bug">0</span></button>
        <button type="button" class="filter-pill" role="tab" data-filter="feature" aria-selected="false">Feature <span class="filter-count" data-count-for="feature">0</span></button>
        <button type="button" class="filter-pill" role="tab" data-filter="note" aria-selected="false">Note <span class="filter-count" data-count-for="note">0</span></button>
        <button type="button" class="filter-pill" role="tab" data-filter="unclassified" aria-selected="false">Unclassified <span class="filter-count" data-count-for="unclassified">0</span></button>
      </div>
      <ul class="list" aria-live="polite"></ul>
      <div class="footer"></div>
    `
    this.wireEvents(panel)
    return panel
  }

  private wireEvents(panel: HTMLElement): void {
    const closeBtn = panel.querySelector<HTMLButtonElement>('.close-btn')
    const submitBtn = panel.querySelector<HTMLButtonElement>('.submit-btn')
    const textarea = panel.querySelector<HTMLTextAreaElement>('textarea')
    const reporterInput = panel.querySelector<HTMLInputElement>('.reporter-input')
    const reporterSubmitBtn = panel.querySelector<HTMLButtonElement>('.reporter-submit-btn')
    if (!closeBtn || !submitBtn || !textarea) return

    closeBtn.addEventListener('click', () => this.close())

    textarea.addEventListener('input', (e) => {
      this.composeValue = (e.target as HTMLTextAreaElement).value
      this.updateComposeState()
    })

    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void this.submitCompose(textarea)
      }
    })

    submitBtn.addEventListener('click', () => {
      void this.submitCompose(textarea)
    })

    // Wire the optional kind radios. Each input has data-kind so the
    // change handler can map the selection to the canonical AnnotationKind.
    // A separate Clear button resets back to null (the brain-dump path).
    const kindInputs = panel.querySelectorAll<HTMLInputElement>(
      '.kinds-row input[type="radio"][data-kind]',
    )
    const clearBtn = panel.querySelector<HTMLButtonElement>('.kind-clear')
    for (const input of Array.from(kindInputs)) {
      input.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLInputElement
        const kind = target.dataset.kind as AnnotationKind | undefined
        if (!kind || (kind !== 'bug' && kind !== 'feature' && kind !== 'note')) return
        if (target.checked) {
          this.composeKind = kind
          if (clearBtn) clearBtn.hidden = false
        }
      })
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.composeKind = null
        for (const input of Array.from(kindInputs)) input.checked = false
        clearBtn.hidden = true
      })
    }

    if (reporterInput && reporterSubmitBtn) {
      const submit = () => {
        void this.submitReporterName(reporterInput)
      }
      reporterSubmitBtn.addEventListener('click', submit)
      reporterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
      })
    }

    // List-filter pills. Click to scope the rendered list to a single
    // kind, or 'unclassified' for notes without one. 'all' is the
    // default and matches every item.
    const filterPills = panel.querySelectorAll<HTMLButtonElement>('.list-filter .filter-pill')
    for (const pill of Array.from(filterPills)) {
      pill.addEventListener('click', () => {
        const next = pill.dataset.filter
        if (
          next === 'all' ||
          next === 'bug' ||
          next === 'feature' ||
          next === 'note' ||
          next === 'unclassified'
        ) {
          this.listFilter = next
          this.render()
        }
      })
    }
  }

  /**
   * Reporter set their display name. Persist via setReporterName, push
   * the new identity to the adapter if it supports runtime swaps, then
   * hide the prompt and reveal the compose form.
   */
  private async submitReporterName(input: HTMLInputElement): Promise<void> {
    const name = input.value.trim()
    if (!name) return
    const ref = setReporterName(name, {
      ...(this.opts.reporterPrompt?.namespace
        ? { namespace: this.opts.reporterPrompt.namespace }
        : {}),
    })
    this.pushIdentityToAdapter(ref)
    this.awaitingReporter = false
    this.render()
    // Focus the compose textarea so the reporter can start typing.
    setTimeout(() => {
      this.shadow?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    }, 0)
  }

  private pushIdentityToAdapter(ref: AuthorRef): void {
    const api = this.opts.api as ApiAdapter & {
      setCurrentUser?: (user: AuthorRef) => void
    }
    if (typeof api.setCurrentUser === 'function') {
      try {
        api.setCurrentUser(ref)
      } catch {
        // Adapter rejected the swap; reporter still has localStorage identity
        // so subsequent reads will pick up the name via auth.
      }
    }
  }

  private updateComposeState(): void {
    if (!this.shadow) return
    const submitBtn = this.shadow.querySelector<HTMLButtonElement>('.submit-btn')
    if (submitBtn) submitBtn.disabled = this.composeValue.trim().length === 0
  }

  /**
   * Optimistic-clear pattern (avoids the double-submit race). Clear the
   * textarea synchronously on submit-click, then post. If the post fails,
   * restore the draft so the user doesn't lose it.
   */
  private async submitCompose(textarea: HTMLTextAreaElement): Promise<void> {
    const body = this.composeValue.trim()
    if (!body) return
    const previous = this.composeValue
    const previousKind = this.composeKind
    // Optimistic clear: don't wait for await.
    this.composeValue = ''
    textarea.value = ''
    // Reset the classification so the next note starts fresh. Reporters
    // who want consecutive notes of the same kind re-pick; the no-carry
    // default avoids accidental classification leakage across notes.
    this.composeKind = null
    this.uncheckKindInputs()
    this.updateComposeState()
    try {
      const query = this.resolveAnchorQuery()
      const anchor =
        query.mode === 'route'
          ? { mode: 'route' as const, path: query.path ?? '/' }
          : {
              mode: 'spatial' as const,
              surface: 'screenshot' as const,
              surfaceId: query.surfaceId ?? 'unknown',
              x: 50,
              y: 50,
            }
      await this.opts.api.create({
        anchor,
        body,
        ...(previousKind ? { kind: previousKind } : {}),
      })
      await this.load()
      // Refocus the textarea so consecutive notes work.
      setTimeout(() => textarea.focus(), 0)
    } catch {
      // Restore draft + classification so the reporter doesn't lose them.
      this.composeValue = previous
      textarea.value = previous
      this.composeKind = previousKind
      this.recheckKindInput(previousKind)
      this.updateComposeState()
    }
  }

  private uncheckKindInputs(): void {
    if (!this.shadow) return
    const inputs = this.shadow.querySelectorAll<HTMLInputElement>(
      '.kinds-row input[type="radio"][data-kind]',
    )
    for (const input of Array.from(inputs)) {
      input.checked = false
    }
    const clearBtn = this.shadow.querySelector<HTMLButtonElement>('.kind-clear')
    if (clearBtn) clearBtn.hidden = true
  }

  private recheckKindInput(kind: AnnotationKind | null): void {
    if (!this.shadow) return
    const inputs = this.shadow.querySelectorAll<HTMLInputElement>(
      '.kinds-row input[type="radio"][data-kind]',
    )
    for (const input of Array.from(inputs)) {
      const k = input.dataset.kind as AnnotationKind | undefined
      input.checked = !!k && k === kind
    }
    const clearBtn = this.shadow.querySelector<HTMLButtonElement>('.kind-clear')
    if (clearBtn) clearBtn.hidden = !kind
  }

  private render(): void {
    if (!this.shadow) return
    const panel = this.shadow.querySelector<HTMLDivElement>('.panel')
    if (!panel) return
    panel.dataset.open = String(this.isOpen)
    panel.dataset.reporterAwait = String(this.awaitingReporter)

    // Show/hide reporter prompt vs compose block based on reporterAwait.
    const reporterBlock = panel.querySelector<HTMLDivElement>('.reporter-prompt')
    const composeBlock = panel.querySelector<HTMLDivElement>('.compose')
    if (reporterBlock) reporterBlock.hidden = !this.awaitingReporter
    if (composeBlock) composeBlock.hidden = this.awaitingReporter

    const title = panel.querySelector<HTMLSpanElement>('.title')
    if (title) title.textContent = this.opts.theme?.drawerTitle ?? 'Page notes'

    const footer = panel.querySelector<HTMLDivElement>('.footer')
    if (footer) footer.textContent = this.opts.theme?.footerHint ?? ''

    const list = panel.querySelector<HTMLUListElement>('.list')
    if (!list) return
    list.innerHTML = ''

    if (this.loading) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = 'Loading...'
      list.appendChild(li)
      return
    }

    // Recompute per-filter counts off the unfiltered items + reflect
    // the active filter on the pill row. Hide the filter row entirely
    // when there's nothing to filter (zero items).
    this.updateFilterRow(panel)

    const visible = this.applyListFilter(this.items)
    if (visible.length === 0) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent =
        this.items.length === 0
          ? (this.opts.theme?.emptyStateCopy ?? 'Nothing pinned here yet.')
          : 'No notes match this filter.'
      list.appendChild(li)
      return
    }
    for (const a of visible) {
      list.appendChild(this.renderItem(a))
    }
  }

  private applyListFilter(items: Annotation[]): Annotation[] {
    if (this.listFilter === 'all') return items
    if (this.listFilter === 'unclassified') return items.filter((a) => !a.kind)
    return items.filter((a) => a.kind === this.listFilter)
  }

  private updateFilterRow(panel: HTMLElement): void {
    const row = panel.querySelector<HTMLDivElement>('.list-filter')
    if (!row) return
    row.hidden = this.items.length === 0
    const counts = {
      all: this.items.length,
      bug: this.items.filter((a) => a.kind === 'bug').length,
      feature: this.items.filter((a) => a.kind === 'feature').length,
      note: this.items.filter((a) => a.kind === 'note').length,
      unclassified: this.items.filter((a) => !a.kind).length,
    }
    for (const [key, count] of Object.entries(counts)) {
      const node = row.querySelector<HTMLSpanElement>(`[data-count-for="${key}"]`)
      if (node) node.textContent = String(count)
    }
    const pills = row.querySelectorAll<HTMLButtonElement>('.filter-pill')
    for (const pill of Array.from(pills)) {
      const f = pill.dataset.filter
      const active = f === this.listFilter
      pill.setAttribute('aria-selected', String(active))
      pill.classList.toggle('is-active', active)
    }
  }

  private renderItem(a: Annotation): HTMLLIElement {
    const li = document.createElement('li')
    li.className = `item${a.state === 'resolved' ? ' resolved' : ''}`
    li.dataset.id = a.id

    const head = document.createElement('div')
    head.className = 'item-head'
    head.textContent = `${a.author.display} · ${formatTime(a.createdAt)}`
    li.appendChild(head)

    if (this.editingId === a.id) {
      const ta = document.createElement('textarea')
      ta.value = this.editingValue
      ta.rows = 3
      ta.addEventListener('input', (e) => {
        this.editingValue = (e.target as HTMLTextAreaElement).value
      })
      ta.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          void this.commitEdit(a)
        } else if (e.key === 'Escape') {
          this.editingId = null
          this.render()
        }
      })
      li.appendChild(ta)
    } else {
      const body = document.createElement('div')
      body.className = 'item-body'
      body.textContent = a.body
      li.appendChild(body)
    }

    // Render the kind badge if the annotation carries one. Pre-kind
    // notes and notes from adapters that drop the field skip this.
    if (a.kind && (a.kind === 'bug' || a.kind === 'feature' || a.kind === 'note')) {
      const row = document.createElement('div')
      row.className = 'kind-badges'
      const badge = document.createElement('span')
      badge.className = `badge kind-${a.kind}`
      badge.textContent = a.kind.charAt(0).toUpperCase() + a.kind.slice(1)
      row.appendChild(badge)
      li.appendChild(row)
    }

    if (a.state === 'resolved') {
      const badge = document.createElement('span')
      badge.className = 'badge resolved'
      if (a.resolvedPR && this.opts.theme?.prUrlTemplate) {
        badge.textContent = `Resolved · PR #${a.resolvedPR}`
      } else if (a.resolvedPR) {
        badge.textContent = `Resolved · PR #${a.resolvedPR}`
      } else {
        badge.textContent = 'Resolved'
      }
      li.appendChild(badge)
    }
    if (a.dupOf) {
      const badge = document.createElement('span')
      badge.className = 'badge dup'
      badge.textContent = `Marked duplicate of ${a.dupOf}`
      li.appendChild(badge)
    }

    const actions = document.createElement('div')
    actions.className = 'item-actions'

    if (this.editingId === a.id) {
      const save = document.createElement('button')
      save.type = 'button'
      save.className = 'btn primary'
      save.textContent = 'Save'
      save.addEventListener('click', () => void this.commitEdit(a))
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'btn ghost'
      cancel.textContent = 'Cancel'
      cancel.addEventListener('click', () => {
        this.editingId = null
        this.render()
      })
      actions.append(save, cancel)
    } else {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'btn ghost'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => {
        this.editingId = a.id
        this.editingValue = a.body
        this.render()
      })

      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'btn ghost'
      del.textContent = 'Delete'
      del.addEventListener('click', () => {
        void this.deleteItem(a.id)
      })

      actions.append(edit, del)
    }
    li.appendChild(actions)
    return li
  }

  private async commitEdit(a: Annotation): Promise<void> {
    const next = this.editingValue.trim()
    if (!next || next === a.body) {
      this.editingId = null
      this.render()
      return
    }
    try {
      await this.opts.api.update(a.id, { body: next })
      this.editingId = null
      await this.load()
    } catch {
      // Keep editing state so the user can retry.
    }
  }

  private async deleteItem(id: string): Promise<void> {
    try {
      await this.opts.api.delete(id)
      await this.load()
    } catch {
      // Silent fail; refresh shows current truth.
    }
  }
}

function formatTime(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}
