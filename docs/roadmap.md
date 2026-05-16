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

## v0.1: Widget core

- [x] Unified `Annotation` type with discriminated `anchor` union (route + spatial)
- [x] Three adapter contracts: `ApiAdapter`, `AuthAdapter`, `ThemeAdapter`
- [x] In-memory adapter (playground default)
- [x] localStorage adapter (browser-only, prototype-friendly)
- [x] Dual render modes: `drawer` (Pivotal pattern) + `overlay` (Lion's Share pattern)
- [x] Click-to-mark mode toggle, wired to the existing v0 bug button (playground integration)
- [~] Triple-selector anchoring: `@medv/finder` + W3C text-quote + viewport shipped; XPath fallback deferred to v0.2
- [x] Spatial anchor capture (x, y percent, clamped to canvas bounds)
- [x] Compose / edit / delete primitives
- [x] Resolution + reopen verbs (resolved_pr column inherited from Pivotal mig 045)
- [x] Overlap tracking (related_ids + dup_of, inherited from Pivotal mig 058)
- [x] CSS custom property theme contract; host pages override at `:root`
- [x] Playground exercises both render modes against the in-memory adapter

Scaffold landed in travisEATSbugs commit `28f78c3` (19 files, 3,198 insertions; 27/27 tests pass; ~17 KB gzipped). Playground integration landed in a follow-up commit.

## v0.2: Backend adapters

- [x] `@travisbreaks/travisEATSbugs-cloudflare` package: D1-backed `ApiAdapter` with full CRUD + UpdatePatch discrimination + audit log table (16/16 tests green, 10 KB ESM)
- [x] `@travisbreaks/travisEATSbugs-http` package: fetch-backed `ApiAdapter` with REST contract + Authorization header + extra headers (12/12 tests green, 3 KB ESM)
- [x] Migrations ported from Pivotal page-notes (043 base + 045 resolution + 058 overlap), consolidated into a single `001_annotations.sql` with the unified anchor union schema
- [~] Cloudflare Worker scaffolded at `apps/worker/`; deploy to `eats.travisfixes.com` pending (needs `wrangler login` + `wrangler d1 create` + DNS edit per `apps/worker/README.md`)
- [x] Tokenized unguessable share-link mode: HMAC-SHA256 sign + verify primitive at `apps/worker/src/share-token.ts`; worker auth accepts share tokens as scoped-reporter identity. Tested with tamper-detection + expiry edge cases.
- [ ] Reporter name prompt on first comment, stored in localStorage (widget-core change, next push)
- [ ] Audit log hook (optional `onAudit` callback for host apps); adapter-side `annotation_audit_log` table shipped + worker writes to it on every mutation; widget-side callback pending

Adapter packages land on branch `feat-v02-adapters-2026-05-16`. Worker scaffold + share-token + handlers land on branch `feat-v02-worker-2026-05-16`. Live deploy is the next push (needs your `wrangler login` + DNS access).

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
