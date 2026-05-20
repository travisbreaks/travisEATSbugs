'use client'

import {
  type Annotation,
  AnnotationPageMode,
  AnnotationWidget,
  type AuditEvent,
  MemoryAdapter,
  destroy as destroyBugButton,
  init as initBugButton,
  wrapWithAudit,
} from '@travisbreaks/travisEATSbugs'
import { useCallback, useEffect, useRef, useState } from 'react'

// Seed one annotation so the demo shows what a saved pin looks like.
const SEED: Annotation[] = [
  {
    id: 'seed-1',
    anchor: {
      mode: 'route',
      path: '/',
      selector: '#demo-hero h1',
      xpath: '/html/body/main/article/section/div[1]/h1',
    },
    body: 'The hero copy needs a tighter rhythm: the second line lands harder than the first.',
    author: { id: 'seed-author', display: 'Alex' },
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    modifiedAt: Date.now() - 1000 * 60 * 60 * 2,
    state: 'open',
    environment: {
      url: 'http://localhost:3000/',
      title: 'travisEATSbugs playground',
      referrer: '',
      os: 'Mac OS',
      browser: 'Chrome',
      browserVersion: '120.0.0.0',
      userAgent: 'demo',
      screenW: 1920,
      screenH: 1080,
      windowW: 1440,
      windowH: 900,
      colorDepth: 24,
      pixelRatio: 2,
      language: 'en-US',
      timezone: 'America/Chicago',
      capturedAt: Date.now() - 1000 * 60 * 60 * 2,
    },
  },
]

export default function Home() {
  const apiRef = useRef<MemoryAdapter | null>(null)
  const pageModeRef = useRef<AnnotationPageMode | null>(null)
  const drawerRef = useRef<AnnotationWidget | null>(null)
  const [feedbackArmed, setFeedbackArmed] = useState(false)

  useEffect(() => {
    const api = new MemoryAdapter({
      seed: SEED,
      currentUser: { id: 'demo', display: 'You' },
    })
    apiRef.current = api

    const onAudit = (event: AuditEvent) => {
      // biome-ignore lint/suspicious/noConsole: intentional demo logging
      console.log('[travisEATSbugs audit]', event)
    }
    const auditedApi = wrapWithAudit(api, onAudit)

    const pageMode = new AnnotationPageMode({ api: auditedApi })
    pageMode.mount()
    pageModeRef.current = pageMode

    // Optional task-list drawer (BugHerd's kanban board equivalent for the
    // logged-in member view). Hidden by default; bug button no longer
    // controls it.
    const drawer = new AnnotationWidget({
      api: auditedApi,
      renderMode: 'drawer',
      position: { bottom: 24, right: 96 },
    })
    drawer.mount()
    drawerRef.current = drawer

    initBugButton({
      project: 'playground',
      onToggle: (active) => {
        setFeedbackArmed(active)
        if (active) pageMode.activate()
        else pageMode.deactivate()
      },
    })

    return () => {
      pageMode.destroy()
      drawer.destroy()
      destroyBugButton()
      pageModeRef.current = null
      drawerRef.current = null
      apiRef.current = null
    }
  }, [])

  const openTaskList = useCallback(() => {
    drawerRef.current?.toggle()
  }, [])

  return (
    <main className="surface">
      <article id="demo-hero">
        <p className="eyebrow">
          <span className="pip" aria-hidden="true">
            ✱
          </span>
          <span>travisEATSbugs / page mode</span>
        </p>

        <section>
          <h1>
            Click the bug.
            <br />
            <em>Then click anywhere.</em>
          </h1>

          <p className="lede">
            The floating button in the bottom-right arms feedback mode. While it&apos;s on, your
            cursor becomes a crosshair, hovered elements get a dashed highlight, and clicking any
            element on this page drops a sticky-note pin attached to that element.
          </p>

          <p className="status">
            <span className={`dot ${feedbackArmed ? 'dot-on' : 'dot-off'}`} aria-hidden="true" />
            {feedbackArmed
              ? 'Feedback mode armed. Click any element on this page.'
              : 'Feedback mode is off. Click the bug button to arm it.'}
          </p>
        </section>

        <section>
          <h2>What gets captured automatically</h2>
          <p>
            Every pin carries a BugHerd-shaped <code>environment</code> payload: the page URL, your
            operating system, your browser and version, the CSS selector path of the clicked
            element, your screen resolution, browser window size, and color depth. No client setup
            required.
          </p>
          <ul>
            <li>Page URL</li>
            <li>Operating system</li>
            <li>Browser + version</li>
            <li>
              CSS selector (via <code>@medv/finder</code>)
            </li>
            <li>XPath fallback</li>
            <li>Screen resolution + browser window size</li>
            <li>Color depth + device pixel ratio</li>
            <li>Language + timezone</li>
          </ul>
        </section>

        <section>
          <h2>Try it</h2>
          <p>Click the bug button. Then click on any of these:</p>
          <div className="targets">
            <button type="button" className="target-btn target-btn-primary">
              Primary action
            </button>
            <button type="button" className="target-btn target-btn-ghost">
              Secondary action
            </button>
            <p className="callout">
              A paragraph with its own context. Click anywhere inside this text and the selector
              captured will resolve to the parent paragraph.
            </p>
            <div className="card-row">
              <div className="mini-card">
                <strong>Card one</strong>
                <span>Heading + body text inside a flex card.</span>
              </div>
              <div className="mini-card">
                <strong>Card two</strong>
                <span>Different selectors, different pins.</span>
              </div>
              <div className="mini-card">
                <strong>Card three</strong>
                <span>Click any of these to drop a pin there.</span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2>The task list</h2>
          <p>
            Once you&apos;ve dropped a few pins, open the task list to see them as a sorted feed
            (this is the surface BugHerd calls the Kanban board).
          </p>
          <button type="button" className="task-list-btn" onClick={openTaskList}>
            Open task list
          </button>
        </section>
      </article>

      <style jsx global>{`
        :root {
          --teb-void: #0c0908;
          --teb-panel: #131110;
          --teb-grid-line: #1e1e1e;
          --teb-text-primary: #e0e0e0;
          --teb-text-secondary: #888;
          --teb-text-tertiary: #767676;
          --teb-signal: #ff2a6d;
          --teb-signal-glow: rgba(255, 42, 109, 0.4);
          --teb-secondary: #05d9e8;
          --teb-tertiary: #cca43b;
          --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);
        }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: var(--teb-void);
          color: var(--teb-text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          min-height: 100vh;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <style jsx>{`
        .surface { min-height: 100vh; padding: 80px 24px 160px; }
        article { max-width: 760px; margin: 0 auto; }
        .eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          margin: 0 0 24px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.75rem; letter-spacing: 0.14em;
          text-transform: uppercase; color: var(--teb-text-secondary);
        }
        .pip { color: var(--teb-tertiary); font-size: 0.9rem; }
        section { margin-bottom: 56px; padding-left: 16px; border-left: 3px solid var(--teb-grid-line); }
        h1 {
          margin: 0 0 24px;
          font-size: clamp(2.2rem, 5vw, 3.4rem);
          line-height: 1.05; font-weight: 700; letter-spacing: -0.02em;
        }
        h1 em { font-style: italic; color: var(--teb-signal); }
        h2 {
          margin: 0 0 14px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.85rem; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--teb-text-tertiary);
          font-weight: 500;
        }
        .lede { font-size: 1.1rem; color: var(--teb-text-secondary); margin: 0 0 24px; max-width: 60ch; }
        .status {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.85rem; padding: 8px 12px;
          background: var(--teb-panel); border: 1px solid var(--teb-grid-line);
          border-radius: 6px;
        }
        .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .dot-on {
          background: var(--teb-signal);
          box-shadow: 0 0 0 0 var(--teb-signal-glow);
          animation: teb-pulse 1800ms var(--teb-ease) infinite;
        }
        .dot-off { background: var(--teb-text-tertiary); }
        @keyframes teb-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--teb-signal-glow); }
          50% { box-shadow: 0 0 0 6px rgba(255, 42, 109, 0); }
        }
        ul { margin: 8px 0 0; padding-left: 18px; list-style: none; }
        ul li { position: relative; margin-bottom: 6px; }
        ul li::before { content: '→'; position: absolute; left: -18px; color: var(--teb-secondary); opacity: 0.6; }
        code {
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.9em; padding: 1px 6px;
          background: var(--teb-panel); border: 1px solid var(--teb-grid-line);
          border-radius: 3px; color: var(--teb-tertiary);
        }
        .targets { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
        .target-btn {
          align-self: flex-start;
          padding: 10px 18px; border-radius: 6px; cursor: pointer;
          font: inherit; font-weight: 600;
          transition: transform 80ms var(--teb-ease), background 160ms var(--teb-ease);
        }
        .target-btn:active { transform: scale(0.97); }
        .target-btn-primary { background: var(--teb-signal); color: #fff; border: 0; }
        .target-btn-primary:hover { background: #ff4682; }
        .target-btn-ghost {
          background: transparent; color: var(--teb-text-primary);
          border: 1px solid var(--teb-grid-line);
        }
        .target-btn-ghost:hover { border-color: var(--teb-tertiary); color: var(--teb-tertiary); }
        .callout {
          background: var(--teb-panel); border: 1px solid var(--teb-grid-line);
          border-radius: 6px; padding: 14px 16px; margin: 0;
        }
        .card-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .mini-card {
          background: var(--teb-panel); border: 1px solid var(--teb-grid-line);
          border-radius: 6px; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .mini-card strong { color: var(--teb-tertiary); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; letter-spacing: 0.04em; }
        .mini-card span { color: var(--teb-text-secondary); font-size: 0.9rem; }
        .task-list-btn {
          background: transparent; color: var(--teb-text-primary);
          border: 1px solid var(--teb-grid-line);
          padding: 8px 14px; border-radius: 4px;
          font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
          font-size: 0.85rem; letter-spacing: 0.04em; cursor: pointer;
          transition: border-color 200ms var(--teb-ease), color 200ms var(--teb-ease);
        }
        .task-list-btn:hover { border-color: var(--teb-tertiary); color: var(--teb-tertiary); }
      `}</style>
    </main>
  )
}
