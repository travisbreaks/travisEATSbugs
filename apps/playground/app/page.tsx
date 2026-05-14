'use client'

import { destroy, init } from '@travisbreaks/travisEATSbugs'
import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    init({ project: 'playground' })
    return () => destroy()
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
          <span>travisEATSbugs playground</span>
        </p>

        <h1>
          Click the bug.
          <br />
          <em>See what happens.</em>
        </h1>

        <p className="lede">
          A floating button injects via Shadow DOM. Theme tokens cascade through. No layout shift on
          hover or press. Reduced-motion respected. Mobile-first touch targets. This is v0.
        </p>

        <section>
          <h2>{'// Working in v0'}</h2>
          <ul>
            <li>Floating bug button, Shadow DOM isolation</li>
            <li>Theme tokens via CSS custom properties (host pages override)</li>
            <li>No-shift hover and active states (transform-only, no layout mutations)</li>
            <li>
              Breathing glow ambient, paused on hover, killed by <code>prefers-reduced-motion</code>
            </li>
            <li>Configurable position: bottom-right, bottom-left, top-right, top-left</li>
            <li>
              Idempotent <code>init()</code> and <code>destroy()</code> lifecycle
            </li>
          </ul>
        </section>

        <section>
          <h2>{'// Up next in v0.1'}</h2>
          <ul>
            <li>Click-to-mark mode toggle</li>
            <li>
              Triple-selector anchoring: <code>@medv/finder</code> + XPath + text-quote
            </li>
            <li>
              Screenshot capture via <code>modern-screenshot</code>
            </li>
            <li>Sticky-note pin UI with Motion animations</li>
          </ul>
        </section>

        <section className="anchor-targets">
          <h2>{'// Sample content for marking'}</h2>
          <p>
            This paragraph exists so the widget has stuff to anchor to once v0.1 ships. Real content
            rendering is unrelated to widget behavior.
          </p>
          <button type="button" className="sample-btn">
            A button to mark
          </button>
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
          padding: 80px 24px 120px;
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
          max-width: 680px;
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
          max-width: 56ch;
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

        .anchor-targets {
          border-left-color: var(--teb-tertiary);
        }

        .sample-btn {
          margin-top: 16px;
          padding: 12px 24px;
          font-family: inherit;
          font-size: 0.95rem;
          background: transparent;
          color: var(--teb-text-primary);
          border: 1px solid var(--teb-grid-line);
          border-radius: 4px;
          transition: box-shadow 200ms var(--teb-ease), color 200ms var(--teb-ease);
          min-height: 44px;
        }

        .sample-btn:hover {
          box-shadow: inset 0 0 0 2px var(--teb-secondary);
          color: var(--teb-secondary);
        }

        .sample-btn:active {
          transform: scale(0.97);
          transition: transform 80ms var(--teb-ease);
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
