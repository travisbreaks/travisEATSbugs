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
- [x] Reporter name prompt on first comment: `localStorageReporter` AuthAdapter + `setReporterName` / `clearReporterName` helpers + `reporterPrompt` config on drawer + overlay. Prompt blocks compose until a name is set; on submit, name persists to localStorage and adapters with `setCurrentUser` swap identity at runtime. Playground demo at `?reporter`.
- [x] Audit log hook: widget-side `onAudit` callback in `WidgetOpts` (fires on create/update/delete via the exported `wrapWithAudit` helper) + adapter-side `annotation_audit_log` table (worker writes on every mutation). Both layers independent; hosts pick either, both, or neither.
- [x] Bug-button auto-wire: `init({ onToggle })` callback in `bug-mode.ts` closes the manual shadow-root-attach workaround. Playground uses it as the canonical pattern.

Live deploy at `eats.travisfixes.com` is the only remaining v0.2 item (needs `wrangler login` + DNS access). All widget-side v0.2 work shipped.

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

- [x] Screenshot capture (`modern-screenshot`): `defaultScreenshotCapture` + `wrapWithScreenshot` helpers in `screenshot.ts`; `screenshotCapture` option on `WidgetOpts` plumbs through. Widget facade composes screenshot + audit wraps so drawer / overlay don't need to know. Adapters carry the `Annotation.screenshot` field. Default uses a data URL (demo-grade); hosts inject R2-upload variants for production.
- [x] AI triage `onCreate` hook (opt-in, no `ANTHROPIC_API_KEY` = no AI call): widget-side `wrapWithTriage` + `httpTriage` helpers; worker-side `POST /triage` route calls Claude (Sonnet 4.6 by default) with tool-use forced structured output, returns `{ severity, category, suggestedAssignee?, dupeOf?, rationale }`. Result writes back via a discriminated `{ triage }` UpdatePatch variant; persisted in dedicated columns via migration `002_triage.sql`. Reporter-mode (share-link) tokens get 403 on the triage route; only member tokens can spend Anthropic credits.
- [x] Sticky-note Motion polish (vanilla CSS, no Framer Motion dep): paper-grain texture via inline-SVG `feTurbulence` data URL (6% alpha) on `.draft` + sidebar `.card` surfaces. Per-marker rest tilt in [-0.5deg, 0.5deg] deterministic via djb2 hash of `id` so tilt stays stable across re-renders. Hover lift on markers + cards (composite-only transform + deeper shadow). Drag-to-reposition on spatial pins via pointer-capture; below the 5 px threshold the marker click-toggles selection, above it commits via a new `{ anchor: AnnotationAnchor }` UpdatePatch variant. The same variant lets route-anchored annotations be re-wired to a new selector / xpath when a stale CSS selector falls through. All motion gated on `prefers-reduced-motion`.
- [x] Real-DOM anchoring fully hardened against page mutations: triple-selector now full (CSS via `@medv/finder` + XPath + W3C text-quote + viewport box). Hosts that need to re-anchor a stale CSS selector can fall through to XPath or text-quote.
- [x] W3C Web Annotation Data Model conversion finalized: `toW3C` + `fromW3C` helpers in `packages/widget/src/w3c.ts`. Emits spec-valid JSON-LD with `@context: http://www.w3.org/ns/anno.jsonld`, `type: Annotation`, `motivation` (`commenting`, or `[commenting, assessing]` for severity=high), `TextualBody` body, `SpecificResource` target. Selector union maps cleanly: `selector` -> `CssSelector`, `xpath` -> `XPathSelector`, `textQuote` -> `TextQuoteSelector`, `viewport` -> `FragmentSelector` with pixel `xywh=`, spatial pins -> `FragmentSelector` with `xywh=percent:` conforming to W3C Media Fragments. Non-spec domain fields (state, severity, resolvedPR, triage, etc.) hang off a `teb:ext` extension block so consumers that don't know us still parse the document as a stock W3C annotation, and round-trip is lossless for consumers that do. Spec-only annotations missing `teb:ext` import cleanly with state defaulted to `open`. 16 unit tests cover round-trip + selector mapping + spec field-name conformance.

**v0.5 complete** — all 6 items shipped.

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
