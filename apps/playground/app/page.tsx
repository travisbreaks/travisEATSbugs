'use client'

import {
  type Annotation,
  AnnotationWidget,
  type AuditEvent,
  type AuthAdapter,
  clearReporterName,
  defaultAuth,
  destroy as destroyBugButton,
  init as initBugButton,
  localStorageReporter,
  MemoryAdapter,
  toW3C,
  type TriageFn,
} from '@travisbreaks/travisEATSbugs'
import { useCallback, useEffect, useRef, useState } from 'react'

const REPORTER_NAMESPACE = 'travisEATSbugs.playground.reporter'

// Seed three sample annotations so the demo reads as a working system on
// first load. Two route-anchored (drawer) + one spatial (overlay).
const SEED: Annotation[] = [
  {
    id: 'seed-1',
    anchor: { mode: 'route', path: '/' },
    body: 'Hero copy reads as "click the bug." That command-shape lands.',
    author: { id: 'seed-author', display: 'Cole' },
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    modifiedAt: Date.now() - 1000 * 60 * 60 * 6,
    state: 'open',
  },
  {
    id: 'seed-2',
    anchor: { mode: 'route', path: '/' },
    body: 'Sample button below the demo: thicker outline on hover would help signal "clickable."',
    author: { id: 'seed-author', display: 'Jesse' },
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    modifiedAt: Date.now() - 1000 * 60 * 60 * 2,
    state: 'resolved',
    resolvedPR: 142,
    resolvedAt: Date.now() - 1000 * 60 * 30,
    resolvedBy: 'demo',
    resolutionNote: 'Outline went from 1px to 2px on hover.',
  },
  {
    id: 'seed-3',
    anchor: {
      mode: 'spatial',
      surface: 'canvas',
      surfaceId: 'playground-canvas',
      x: 30,
      y: 42,
    },
    body: 'This corner of the staging preview needs a tighter crop.',
    author: { id: 'seed-author', display: 'Cole' },
    createdAt: Date.now() - 1000 * 60 * 30,
    modifiedAt: Date.now() - 1000 * 60 * 30,
    state: 'open',
  },
]

/**
 * Stub TriageFn that produces a structurally-correct TriageResult without
 * hitting the real Anthropic API. Keeps the playground free of network
 * calls and credit spend; production hosts swap this for `httpTriage`
 * pointed at the deployed worker route.
 */
const stubTriage: TriageFn = async (annotation) => {
  const body = annotation.body.toLowerCase()
  const severity: 'low' | 'medium' | 'high' =
    body.length > 140 || /broken|crash|wrong|missing|cannot|can't|won't/.test(body)
      ? 'high'
      : body.length > 60
        ? 'medium'
        : 'low'
  let category = 'misc'
  if (/contrast|focus|aria|alt|tab|screen reader/.test(body)) category = 'a11y'
  else if (/copy|wording|grammar|spelling|tone/.test(body)) category = 'copy'
  else if (/layout|spacing|align|grid|column|margin|padding/.test(body)) category = 'layout'
  else if (/slow|lag|jank|fps|perf|loading/.test(body)) category = 'perf'
  else if (/crash|error|broken|fail|404|500/.test(body)) category = 'broken'
  return {
    severity,
    category,
    rationale: 'demo classifier (length + keywords); replace with httpTriage in production',
    triagedAt: Date.now(),
  }
}

export default function Home() {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<MemoryAdapter | null>(null)
  const [reporterMode, setReporterMode] = useState(false)
  const [triageEnabled, setTriageEnabled] = useState(false)
  const triageEnabledRef = useRef(false)
  useEffect(() => {
    triageEnabledRef.current = triageEnabled
  }, [triageEnabled])

  useEffect(() => {
    setReporterMode(
      typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('reporter'),
    )
  }, [])

  const resetReporter = useCallback(() => {
    clearReporterName({ namespace: REPORTER_NAMESPACE })
    if (typeof window !== 'undefined') window.location.reload()
  }, [])

  useEffect(() => {
    // Reporter mode (anonymous-user share-link flow) is triggered by
    // `?reporter` on the URL. Without the flag we use defaultAuth and
    // skip the prompt entirely. With the flag, localStorageReporter
    // returns null until a name is set; the drawer + overlay both
    // surface their prompts, and once the reporter types a name the
    // adapter's currentUser is swapped via setCurrentUser.
    const isReporter =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('reporter')

    const auth: AuthAdapter = isReporter
      ? localStorageReporter({ namespace: REPORTER_NAMESPACE })
      : defaultAuth

    // Single in-memory store backs BOTH render modes so a note created in
    // the drawer shows up alongside seeded ones in `list()` calls, and the
    // overlay sees its spatial annotations through the same store.
    const api = new MemoryAdapter({
      seed: SEED,
      // Default until reporter sets their name; setCurrentUser swaps in
      // the new identity when they do.
      currentUser: { id: 'demo', display: 'You' },
    })
    apiRef.current = api

    // Demo audit hook: log every mutation to the console. Real consumers
    // (Pivotal admin inbox, Lion's Share /tracks aggregator) wire this to
    // their own audit log + realtime broadcast.
    const onAudit = (event: AuditEvent) => {
      // biome-ignore lint/suspicious/noConsole: intentional demo logging
      console.log('[travisEATSbugs audit]', event)
    }

    const reporterPrompt = isReporter
      ? { namespace: REPORTER_NAMESPACE }
      : undefined

    // Late-bound triage so the toggle button can flip behavior at runtime
    // without remounting the widgets. The wrap reads triageEnabledRef on
    // every call; when off it returns null (matching the "no triage URL
    // configured" production behavior).
    const triage: TriageFn = async (a) => (triageEnabledRef.current ? stubTriage(a) : null)

    const drawer = new AnnotationWidget({
      api,
      auth,
      onAudit,
      triage,
      renderMode: 'drawer',
      // Sit left of the bug button so both are visible.
      position: { bottom: 24, right: 96 },
      ...(reporterPrompt ? { reporterPrompt } : {}),
    })
    drawer.mount()

    let overlay: AnnotationWidget | null = null
    if (surfaceRef.current) {
      overlay = new AnnotationWidget({
        api,
        auth,
        onAudit,
        triage,
        renderMode: 'overlay',
        surface: surfaceRef.current,
        surfaceId: 'playground-canvas',
        surfaceKind: 'canvas',
        headerMode: 'minimal',
        showSidebar: true,
        initialFilter: 'all',
        ...(reporterPrompt ? { reporterPrompt } : {}),
      })
      overlay.mount()
    }

    // v0 floating bug button. The new `onToggle` prop closes the
    // "consumer wires this manually" deferral: no more shadow-root
    // attach, just hand init() a callback that flips the drawer.
    initBugButton({
      project: 'playground',
      onToggle: () => drawer.toggle(),
    })

    return () => {
      drawer.destroy()
      overlay?.destroy()
      destroyBugButton()
      apiRef.current = null
    }
  }, [])

  const exportW3C = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    const all = await api.list({ state: 'all' })
    const doc = {
      '@context': 'http://www.w3.org/ns/anno.jsonld',
      type: 'AnnotationCollection',
      total: all.length,
      items: all.map((a) => toW3C(a)),
    }
    const json = JSON.stringify(doc, null, 2)
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(json)
      } catch {
        // fall through to download
      }
    }
    if (typeof document === 'undefined') return
    const blob = new Blob([json], { type: 'application/ld+json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'travisEATSbugs-annotations.jsonld'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <main className="surface">
      <div className="grain" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="presentation">
          <title>Decorative film grain texture</title>
          <filter id="grain-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain-filter)" />
        </svg>
      </div>

      <article>
        <p className="eyebrow">
          <span className="pip" aria-hidden="true">
            ✱
          </span>
          <span>travisEATSbugs playground / v0.1</span>
        </p>

        <h1>
          Click the bug.
          <br />
          <em>Drop a marker.</em>
        </h1>

        <p className="lede">
          Floating button bottom-right opens the drawer (route-anchored annotations on the current
          page). The staging surface below accepts click-to-place markers (spatial-anchored
          annotations). Both render modes read from the same in-memory store.
        </p>

        <section>
          <h2>{'// drawer mode (route anchor)'}</h2>
          <p className="section-body">
            The bug icon at the bottom-right opens a side drawer with all annotations scoped to the
            current route. Type a note, hit{' '}
            <code>
              <span className="kbd">⌘</span>↵
            </code>{' '}
            to save. Edit or delete inline. Resolved notes carry a PR badge.
          </p>
        </section>

        <section>
          <h2>{'// overlay mode (spatial anchor)'}</h2>
          <p className="section-body">
            Click anywhere on the staging surface below to drop a marker. Resolve toggles state.
            Filters cycle open / resolved / all. The seeded marker shows the rendered shape.
          </p>
          <div ref={surfaceRef} id="playground-canvas" className="overlay-surface" />
        </section>

        <section>
          <h2>{'// what these adapters know'}</h2>
          <ul>
            <li>
              Drawer + overlay share one <code>MemoryAdapter</code> instance, so a note created in
              one mode is queryable from the other.
            </li>
            <li>
              <code>UpdatePatch</code> shape is strictly discriminated: body OR resolve OR reopen OR
              overlap, never combined.
            </li>
            <li>
              <code>defaultAuth</code> returns a stub user; real consumers (Pivotal, Lion's Share)
              inject their own auth adapter.
            </li>
            <li>
              CSS custom properties on <code>:root</code> pierce the Shadow DOM boundary so each
              host theme drives the widget's look without a build step.
            </li>
          </ul>
        </section>

        <section>
          <h2>{'// reporter mode (share-link flow)'}</h2>
          <p className="section-body">
            Visit{' '}
            <a className="link" href="?reporter">
              ?reporter
            </a>{' '}
            to flip the playground into reporter mode. The auth adapter becomes{' '}
            <code>localStorageReporter</code>, the drawer and overlay both prompt for a name
            before accepting input, and the adapter's <code>currentUser</code> swaps to the new
            identity on submit.{' '}
            {reporterMode ? (
              <button type="button" className="link-btn" onClick={resetReporter}>
                clear stored name + reload
              </button>
            ) : (
              <span className="hint">
                You&apos;re currently in default-auth mode (instant demo user).
              </span>
            )}
          </p>
        </section>

        <section>
          <h2>{'// v0.5 polish (try it)'}</h2>
          <p className="section-body">
            Spatial pins on the staging surface tilt at a per-pin random rest angle and lift on
            hover. Drag any pin to reposition (commits a new <code>anchor</code> patch); under
            ~5&nbsp;px counts as a click. Compose forms render as paper-textured sticky notes.
            Reduced-motion preference disables the lot.
          </p>
          <p className="section-body">
            AI triage runs after every successful <code>create</code> via{' '}
            <code>wrapWithTriage</code>. The playground uses a stub classifier (length + keyword
            heuristics) for zero-cost demos; production wires <code>httpTriage</code> at the
            deployed worker.
          </p>
          <div className="cta-row">
            <button
              type="button"
              className="cta-btn"
              onClick={() => setTriageEnabled((v) => !v)}
              aria-pressed={triageEnabled}
            >
              {triageEnabled ? 'Triage: on (stub)' : 'Triage: off'}
            </button>
            <button type="button" className="cta-btn" onClick={exportW3C}>
              Export as W3C JSON-LD
            </button>
          </div>
          <p className="section-body hint">
            With triage on, create a new annotation: the audit log shows two adapter writes (create
            + triage). The W3C export converts every annotation to spec-shaped JSON-LD with the
            full selector union and a <code>teb:ext</code> extension block.
          </p>
        </section>

        <section>
          <h2>{'// up next'}</h2>
          <ul>
            <li>
              v0.2 worker live deploy at <code>eats.travisfixes.com</code> (the only remaining v0.2
              gate; needs <code>wrangler login</code>).
            </li>
            <li>v0.3 Pivotal cutover (Bibble + Lion&apos;s Share own this; not the widget&apos;s job).</li>
            <li>v0.4 Lion&apos;s Share cutover (same).</li>
            <li>v0.6 integrations: GitHub Issues, Linear, Jira, Slack two-way sync.</li>
            <li>v1.0 public npm release + docs site.</li>
          </ul>
        </section>

        <footer>
          <span className="footer-meta">
            Route signal through chaos. <span className="footer-dot">·</span> Apache 2.0
          </span>
        </footer>
      </article>

      <style jsx global>{`
        :root {
          --teb-void: #0c0908;
          --teb-panel: #131110;
          --teb-grid-line: #1e1e1e;
          --teb-text-primary: #e0e0e0;
          --teb-text-secondary: #888888;
          --teb-text-tertiary: #767676;
          --teb-signal: #ff2a6d;
          --teb-signal-glow: rgba(255, 42, 109, 0.4);
          --teb-secondary: #05d9e8;
          --teb-tertiary: #cca43b;
          --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);
          --teb-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--teb-void);
          color: var(--teb-text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          cursor: crosshair;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        a,
        button,
        [role='button'] {
          cursor: pointer;
        }

        input,
        textarea {
          cursor: text;
        }

        ::selection {
          background: rgba(204, 164, 59, 0.25);
          color: var(--teb-text-primary);
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <style jsx>{`
        .surface {
          position: relative;
          min-height: 100vh;
          padding: 80px 24px 160px;
          overflow-x: hidden;
        }

        .grain {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          opacity: 0.035;
          mix-blend-mode: overlay;
        }

        .grain svg {
          width: 100%;
          height: 100%;
        }

        article {
          position: relative;
          z-index: 2;
          max-width: 720px;
          margin: 0 auto;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 24px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.75rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--teb-text-secondary);
        }

        .pip {
          color: var(--teb-tertiary);
          font-size: 0.9rem;
        }

        h1 {
          margin: 0 0 24px;
          font-size: clamp(2.2rem, 5vw, 3.4rem);
          line-height: 1.05;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--teb-text-primary);
        }

        h1 em {
          font-style: italic;
          color: var(--teb-signal);
        }

        .lede {
          font-size: 1.1rem;
          color: var(--teb-text-secondary);
          margin: 0 0 56px;
          max-width: 60ch;
        }

        section {
          margin-bottom: 48px;
          padding-left: 16px;
          border-left: 3px solid var(--teb-grid-line);
        }

        section h2 {
          margin: 0 0 16px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.85rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--teb-text-tertiary);
          font-weight: 500;
        }

        .section-body {
          color: var(--teb-text-primary);
          max-width: 60ch;
          margin: 0 0 16px;
        }

        ul {
          margin: 0;
          padding-left: 18px;
          list-style: none;
        }

        ul li {
          position: relative;
          margin-bottom: 8px;
          color: var(--teb-text-primary);
        }

        ul li::before {
          content: '→';
          position: absolute;
          left: -18px;
          color: var(--teb-secondary);
          opacity: 0.6;
        }

        code {
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.9em;
          padding: 1px 6px;
          background: var(--teb-panel);
          border: 1px solid var(--teb-grid-line);
          border-radius: 3px;
          color: var(--teb-tertiary);
        }

        .kbd {
          color: var(--teb-text-primary);
          margin-right: 2px;
        }

        .link {
          color: var(--teb-signal);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .link:hover { color: var(--teb-secondary); }

        .link-btn {
          background: transparent;
          border: 0;
          padding: 0;
          color: var(--teb-signal);
          text-decoration: underline;
          text-underline-offset: 3px;
          font: inherit;
          cursor: pointer;
        }
        .link-btn:hover { color: var(--teb-secondary); }

        .cta-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 16px 0 8px;
        }
        .cta-btn {
          background: transparent;
          border: 1px solid var(--teb-grid-line);
          color: var(--teb-text-primary);
          padding: 8px 14px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.85rem;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition:
            border-color 200ms var(--teb-ease),
            color 200ms var(--teb-ease);
        }
        .cta-btn:hover {
          border-color: var(--teb-tertiary);
          color: var(--teb-tertiary);
        }
        .cta-btn[aria-pressed='true'] {
          border-color: var(--teb-signal);
          color: var(--teb-signal);
        }

        .hint {
          color: var(--teb-text-secondary);
          font-style: italic;
        }

        .overlay-surface {
          margin-top: 20px;
          width: 100%;
          aspect-ratio: 16 / 10;
          background: linear-gradient(
            135deg,
            rgba(204, 164, 59, 0.08) 0%,
            rgba(204, 164, 59, 0.02) 100%
          );
          border: 1px solid var(--teb-grid-line);
          border-radius: 4px;
          position: relative;
        }

        footer {
          margin-top: 80px;
          padding-top: 24px;
          border-top: 1px solid var(--teb-grid-line);
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          color: var(--teb-text-tertiary);
        }

        .footer-dot {
          color: var(--teb-tertiary);
          margin: 0 8px;
        }

        @media (max-width: 640px) {
          .surface {
            padding: 56px 20px 96px;
          }
        }
      `}</style>
    </main>
  )
}
