# travisEATSbugs Architecture

**Date:** 2026-05-14
**Status:** v0 scaffold

This document captures the architectural decisions made on day one, sourced from two research docs:
- [BugHerd and Visual Feedback Tools: Competitive Research](../../pivotal-replacement/docs/research-bugherd-and-comps-2026-05-14.md)
- [OSS Annotation / Visual-Feedback Research](../../pivotal-replacement/docs/research-oss-annotation-tools-2026-05-14.md)

## Strategic position

travisEATSbugs is not a feature for one product. It's the tool that sits on top of every product Travis ships. Pivotal Agency today (proof-of-concept), Lions Share Digital next, every client beyond. Same widget, same npm package, drops into all of them and lights up immediately.

Every design decision optimizes for installability across multiple downstream products, not for any single host.

## What we are NOT building

- A BugHerd clone. They have 13 years of edge cases handled. Don't fight that war.
- A SaaS-only product. Self-hostable from day one.
- A real-time-first product. Polling-on-focus in v1, Yjs over Cloudflare Durable Objects in v2.
- A canvas-drawing tool. Sticky-note pins, not freeform drawing. Excalidraw / tldraw are out of scope.

## The white space we're aiming at

No existing tool ships visual feedback + agency project rollups + hours tracking + client lists in one product. We do. Pivotal and Lions Share already have the agency-platform pieces; travisEATSbugs is the feedback layer that makes the bundle defensible.

## Core architecture

### Widget delivery: snippet + npm

Two install paths:

1. **One-line CDN snippet:**
   ```html
   <script src="https://eats.travisfixes.com/v1.js" data-project="YOUR_TOKEN"></script>
   ```
2. **npm package:**
   ```ts
   import { init } from '@travisbreaks/travisEATSbugs'
   init({ project: 'YOUR_TOKEN' })
   ```

### Style isolation: Shadow DOM

The widget injects into a Shadow DOM root. Required for installability: host pages have unpredictable CSS, and the widget must not leak into or absorb from host styles. The Shadow DOM also makes the widget invisible to host-page event handlers unless we explicitly bubble events out.

### Anchoring: triple-selector

Every pin stores three selectors and falls back gracefully:

1. **CSS selector** via [`@medv/finder`](https://github.com/antonmedv/finder). Shortest unique selector. Primary.
2. **XPath**. Stable across class-name churn (Emotion / styled-components / Tailwind JIT).
3. **W3C text-quote selector**. Surface text + prefix + suffix. Survives DOM restructuring as long as the text stays.

Stored using the [W3C Web Annotation Data Model](https://w3c.github.io/web-annotation/model/wd/). Free interop with Hypothesis, Annotorious, and any future consumer.

The position within the anchor element is stored as a fraction of the bounding box (`{x: 0.3, y: 0.7}`) so the pin survives responsive resize. Algorithm borrowed from [SitePing](https://github.com/NeosiaNexus/SitePing).

### Screenshot capture: modern-screenshot

[`modern-screenshot`](https://github.com/qq15725/modern-screenshot) over html2canvas. Faster, smaller, better on modern CSS. Optional server-side fallback via headless Chrome for sites that fail client-side capture.

### Store: pluggable adapter

```ts
interface Adapter {
  create(annotation: Annotation): Promise<{ id: string }>
  list(filter: Filter): Promise<Annotation[]>
  update(id: string, patch: Partial<Annotation>): Promise<void>
  resolve(id: string, resolution: Resolution): Promise<void>
  delete(id: string): Promise<void>
  onCreate(handler: (a: Annotation) => void): void
}
```

Two adapters ship in this monorepo:

- **`@travisbreaks/travisEATSbugs-cloudflare`**: D1 + R2, default hosted backend at `eats.travisfixes.com`. The path for hosts that don't want to run their own server.
- **`@travisbreaks/travisEATSbugs-http`**: BYO endpoint. POST/GET/PATCH/DELETE against a host-supplied URL. For self-hosted deploys with their own backend.

### Auth model

Two-tier, copied from BugHerd because it's the right pattern:

- **Members**: paid seats, dashboard access, can manage / resolve / delete.
- **Reporters / Guests**: unlimited, free. Comment via share link or project token. No signup required. Identity is a name prompt on first comment, stored in localStorage on their browser.

No-auth reporter access is non-negotiable. Largest feature gap between the existing page-notes seed and the BugHerd category.

### AI triage: single webhook point

The adapter's `onCreate` event fires a webhook to a Cloudflare Worker. The worker runs Claude over:

```ts
{
  title: string
  comment_text: string
  screenshot_url: string
  page_url: string
  element_selector: string
}
```

And returns:

```ts
{
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'visual' | 'copy' | 'data' | 'perf' | 'a11y' | 'other'
  suggested_assignee?: string
  dupe_of?: string  // id of existing annotation
}
```

The response is written back to the annotation as a W3C `body` field. Hosts can disable AI triage by not setting `AI_TRIAGE_URL` on the adapter.

### Sticky-note visual layer

No existing OSS project ships "yellow paper, tilt, lift, drag" well. Build from primitives:

- CSS `transform: rotate(<deterministic-from-pin-id>deg)` for individual tilt
- Paper-texture SVG noise overlay
- [Motion](https://motion.dev) `whileHover` for lift-and-tilt
- Motion `whileDrag` + `dragMomentum` for physics-based reposition
- Color-coded by pin kind: bug (yellow/amber), idea (blue), question (purple), praise (green)

Themeable so each downstream product can override colors, fonts, paper texture. Per-product visual canon means Pivotal pins look Pivotal-y, Lions Share pins look Lions Share-y.

## Design canon

travisEATSbugs is part of the Travis design family. Every surface (widget, playground, marketing, docs) adheres to the canon at [memory/design-canon.md](../../memory/design-canon.md). Full per-product theming guide and audit checklist at [docs/design.md](./design.md).

**Non-negotiable rules:**
- **No-Shift Principle**: no interaction shifts host-page layout. Composite-only transforms (translate, scale, rotate).
- **`prefers-reduced-motion` kill switch**: MANDATORY on every animated property.
- **No em dashes** anywhere (use colons, periods, parens).
- **Easing**: `cubic-bezier(0.45, 0, 0.55, 1)` for ambient, `cubic-bezier(0.16, 1, 0.3, 1)` for entrance reveals.
- **Mobile-first**: 44px minimum touch target, 48-52px on narrow viewports.

**Color is role-based, not fixed palette.** Widget exposes theme tokens (`--teb-signal`, `--teb-fg`, `--teb-shadow`, etc.) as CSS custom properties on `:host`. Host pages override at `:root`. CSS custom properties pierce Shadow DOM boundaries automatically.

**Per-product visual canon.** Each downstream brand (Pivotal, Lions Share, Theoria, travisFIXES) recolors the widget independently. The widget recolors per host; it does NOT impose any single brand identity. The marketing surface at `eats.travisfixes.com` IS a travisFIXES property and follows the travisFIXES signature.

## Tech stack

- **Language:** TypeScript everywhere
- **Workspaces:** pnpm
- **Bundler:** tsup (ESM + CJS + IIFE)
- **Test runner:** Vitest + happy-dom
- **Lint / format:** Biome
- **Playground:** Next.js 15 + React 19
- **Hosted backend:** Cloudflare Workers + D1 + R2
- **Targeting:** ES2022, modern browsers (no IE11, no transpile-everything-to-ES5)

## Why not just adopt SitePing?

[SitePing](https://github.com/NeosiaNexus/SitePing) is the closest thing on GitHub to "OSS BugHerd" and has the multi-selector anchoring we want. We considered three paths:

(a) **Adopt:** Write a CF D1 adapter for SitePing, ship travisEATSbugs as a SitePing distribution.
(b) **Fork:** Customize SitePing with our brand and the sticky-note layer.
(c) **Rebuild from primitives:** Use SitePing as reference for the anchoring algorithm only. Build the rest fresh.

We picked **(c)**. The sticky-note interaction is enough of a differentiator that anchoring our API surface to SitePing's is the wrong long-term move. SitePing stays as the reference impl for the bounding-box-fraction algorithm and the `@medv/finder` + XPath + text-quote fallback chain.

## Roadmap

v0 (this scaffold):
- Floating bug button injected via Shadow DOM
- pnpm workspace, tsup build, Vitest tests, Next.js playground

v0.1:
- Click-to-mark mode toggle
- Triple-selector anchoring via `@medv/finder`
- Screenshot capture via `modern-screenshot`
- Sticky-note pin UI (Motion + paper texture)
- localStorage adapter (no backend needed)

v0.2:
- HTTP adapter
- Tokenized share-link mode for unauthenticated reporters
- W3C Web Annotation Data Model on the wire

v0.3:
- Cloudflare D1 + R2 adapter
- Hosted backend at eats.travisfixes.com
- Admin dashboard (separate package)

v0.4:
- AI triage webhook
- Tadao classifies, suggests assignee, finds dupes

v0.5:
- Two-way sync: GitHub Issues, Jira, Linear
- Resolved-PR link-back

v1.0:
- Public npm release
- Documentation site at eats.travisfixes.com
- Marketing site
