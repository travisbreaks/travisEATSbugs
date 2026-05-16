'use client'

import {
  type Annotation,
  AnnotationWidget,
  type AuditEvent,
  MemoryAdapter,
  defaultAuth,
  destroy as destroyBugButton,
  init as initBugButton,
} from '@travisbreaks/travisEATSbugs'
import { useEffect, useRef } from 'react'

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

export default function Home() {
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Single in-memory store backs BOTH render modes so a note created in
    // the drawer shows up alongside seeded ones in `list()` calls, and the
    // overlay sees its spatial annotations through the same store.
    const api = new MemoryAdapter({ seed: SEED })

    // Demo audit hook: log every mutation to the console. Real consumers
    // (Pivotal admin inbox, Lion's Share /tracks aggregator) wire this to
    // their own audit log + realtime broadcast.
    const onAudit = (event: AuditEvent) => {
      // biome-ignore lint/suspicious/noConsole: intentional demo logging
      console.log('[travisEATSbugs audit]', event)
    }

    const drawer = new AnnotationWidget({
      api,
      auth: defaultAuth,
      onAudit,
      renderMode: 'drawer',
      // Sit left of the bug button so both are visible.
      position: { bottom: 24, right: 96 },
    })
    drawer.mount()

    let overlay: AnnotationWidget | null = null
    if (surfaceRef.current) {
      overlay = new AnnotationWidget({
        api,
        auth: defaultAuth,
        onAudit,
        renderMode: 'overlay',
        surface: surfaceRef.current,
        surfaceId: 'playground-canvas',
        surfaceKind: 'canvas',
        headerMode: 'minimal',
        showSidebar: true,
        initialFilter: 'all',
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
    }
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
          <h2>{'// up next'}</h2>
          <ul>
            <li>v0.2 backend adapters: Cloudflare D1 + R2 worker, BYO HTTP.</li>
            <li>v0.3 Pivotal cutover: page-notes drawer swaps for AnnotationWidget.</li>
            <li>v0.4 Lion&apos;s Share cutover: pin-annotations swap for AnnotationWidget overlay.</li>
            <li>v0.5 AI triage hook + screenshot capture + sticky-note Motion polish.</li>
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
