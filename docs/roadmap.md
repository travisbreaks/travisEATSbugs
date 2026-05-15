# Roadmap

Aligned to `docs/extraction-strategy-2026-05-15.md`. The consolidation around Pivotal + Lion's Share as primary consumers reshaped the original phase order. The earlier roadmap survives in git history if needed.

## v0: Scaffold (2026-05-14, shipped)

- [x] Repo + monorepo layout
- [x] License (Apache 2.0)
- [x] `packages/widget/` with floating bug button v0
- [x] `apps/playground/` with widget loaded
- [x] `docs/architecture.md`
- [x] CI workflow
- [x] GitHub issues per major feature
- [ ] Branch protection (deferred; low value on solo private repo)

## v0.1: Widget core (target: this week)

- [ ] Unified `Annotation` type with discriminated `anchor` union (route + spatial)
- [ ] Three adapter contracts: `ApiAdapter`, `AuthAdapter`, `ThemeAdapter`
- [ ] In-memory adapter (playground default)
- [ ] localStorage adapter (browser-only, prototype-friendly)
- [ ] Dual render modes: `drawer` (Pivotal pattern) + `overlay` (Lion's Share pattern)
- [ ] Click-to-mark mode toggle, wired to the existing v0 bug button
- [ ] Triple-selector anchoring (`@medv/finder` + XPath fallback + W3C text-quote)
- [ ] Spatial anchor capture (x, y percent, clamped to canvas bounds)
- [ ] Compose / edit / delete primitives
- [ ] Resolution + reopen verbs (resolved_pr column inherited from Pivotal mig 045)
- [ ] Overlap tracking (related_ids + dup_of, inherited from Pivotal mig 058)
- [ ] CSS custom property theme contract; host pages override at `:root`
- [ ] Playground exercises both render modes against the in-memory adapter

## v0.2: Backend adapters

- [ ] `@travisbreaks/travisEATSbugs-cloudflare` (D1 + R2 + worker)
- [ ] `@travisbreaks/travisEATSbugs-http` (BYO backend)
- [ ] Cloudflare Worker deployed at `eats.travisfixes.com` as the default hosted backend
- [ ] Migrations ported from Pivotal page-notes (043 base + 045 resolution + 058 overlap), namespaced for adapter use
- [ ] Tokenized unguessable share-link mode (reporter mode, no signup)
- [ ] Reporter name prompt on first comment, stored in localStorage
- [ ] Audit log hook (optional `onAudit` callback for host apps)

## v0.3: Pivotal cutover

- [ ] `pivotal-adapter` satisfying ApiAdapter + AuthAdapter + ThemeAdapter using existing auth-stub + D1 binding
- [ ] Swap `<PageNotesDrawer />` for `<AnnotationWidget renderMode="drawer" adapter={pivotalAdapter} />`
- [ ] Preserve existing `page_notes` table; widget reads same schema through the adapter
- [ ] Verify 21/21 smoke green
- [ ] Stage on preview deploy first, dogfood one full day, then promote (per Travis 2026-05-15 decision)
- [ ] Cole sees no behavior change

## v0.4: Lion's Share cutover

- [ ] `lions-share-adapter` (skips the planned localStorage-to-D1 intermediate step; goes straight to widget adapter per Travis 2026-05-15 decision)
- [ ] Swap `<PinAnnotations />` for `<AnnotationWidget renderMode="overlay" headerMode="mac-chrome" adapter={lionsAdapter} />`
- [ ] `/tracks` aggregator reads via direct adapter call + injected `inferSeverity` (preserves the 3-day-client-authored heuristic)
- [ ] Per-client tinted theme via CSS custom properties (existing pattern)

## v0.5: Triage + capture + animation polish

- [ ] Screenshot capture (`modern-screenshot`) on annotation create
- [ ] `onCreate` webhook to AI triage worker (opt-in, no triage URL = no AI call)
- [ ] Claude classifier returns `{ severity, category, suggested_assignee, dupe_of? }` written back as W3C `body` field
- [ ] Sticky-note Motion animation: paper texture, subtle tilt on rest, lift on hover, drag-to-reposition
- [ ] Real-DOM anchoring fully hardened against page mutations (selector stability across React re-renders)
- [ ] W3C Web Annotation Data Model on-disk shape finalized

## v0.6: Integrations (formerly v0.5)

- [ ] GitHub Issues two-way sync (comment becomes issue, issue close writes back to pin)
- [ ] Linear two-way sync
- [ ] Jira two-way sync
- [ ] Slack notification webhook

PR link-back specifically (`resolved_pr` column) ships earlier as a core primitive in v0.1 since it's inherited from Pivotal mig 045. The v0.6 work is the full bidirectional ticket-sync layer on top.

## v1.0: Public release

- [ ] Public npm release
- [ ] Documentation site at `eats.travisfixes.com`
- [ ] Marketing site (live at [travismakes.org/travis-eats-bugs/](https://travismakes.org/travis-eats-bugs/))
- [ ] Live demo
- [ ] Example integrations (React, Vue, Svelte, vanilla)

## Future / unscheduled

- [ ] Real-time collab via Yjs over Cloudflare Durable Objects
- [ ] Mobile-app SDK (React Native, native iOS/Android)
- [ ] Drawable annotation mode (Excalidraw embed)
- [ ] Session replay for bug repro
