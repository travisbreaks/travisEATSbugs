# Roadmap

See `docs/architecture.md` for the contract this roadmap delivers against. Phase order reflects the consolidation around dual host integration patterns (drawer mode for CMS-style hosts, overlay mode for spatial-pin hosts).

## v0: Scaffold (2026-05-14, shipped)

- [x] Repo + monorepo layout
- [x] License (Apache 2.0)
- [x] `packages/widget/` with floating bug button v0
- [x] `apps/playground/` with widget loaded
- [x] `docs/architecture.md`
- [x] CI workflow
- [x] GitHub issues per major feature
- [x] Branch protection on `main` (enabled 2026-05-20, post-extraction, with two production consumers depending on the repo)

## v0.1: Widget core

- [x] Unified `Annotation` type with discriminated `anchor` union (route + spatial)
- [x] Three adapter contracts: `ApiAdapter`, `AuthAdapter`, `ThemeAdapter`
- [x] In-memory adapter (playground default)
- [x] localStorage adapter (browser-only, prototype-friendly)
- [x] Dual render modes: `drawer` (route-anchored) + `overlay` (spatial pins)
- [x] Click-to-mark mode toggle, wired to the existing v0 bug button (playground integration)
- [~] Triple-selector anchoring: `@medv/finder` + W3C text-quote + viewport shipped; XPath fallback deferred to v0.2
- [x] Spatial anchor capture (x, y percent, clamped to canvas bounds)
- [x] Compose / edit / delete primitives
- [x] Resolution + reopen verbs (`resolved_pr` column)
- [x] Overlap tracking (`related_ids` + `dup_of`)
- [x] CSS custom property theme contract; host pages override at `:root`
- [x] Playground exercises both render modes against the in-memory adapter

Scaffold landed in travisEATSbugs commit `28f78c3` (19 files, 3,198 insertions; 27/27 tests pass; ~17 KB gzipped). Playground integration landed in a follow-up commit.

## v0.2: Backend adapters

- [x] `@travisbreaks/travisEATSbugs-cloudflare` package: D1-backed `ApiAdapter` with full CRUD + UpdatePatch discrimination + audit log table (16/16 tests green, 10 KB ESM)
- [x] `@travisbreaks/travisEATSbugs-http` package: fetch-backed `ApiAdapter` with REST contract + Authorization header + extra headers (12/12 tests green, 3 KB ESM)
- [x] Migrations consolidate the page-notes schema evolution (base + resolution + overlap) into a single `001_annotations.sql` with the unified anchor union schema
- [x] Cloudflare Worker live at `https://eats.travisfixes.com` (deployed 2026-05-16). D1 `travisEATSbugs` provisioned (id `9118617e-0f72-401a-82e3-f1031648cb22`), both migrations applied remotely, secrets (`SHARE_TOKEN_SECRET`, `ANTHROPIC_API_KEY`, `MEMBER_TOKENS`) attached via `wrangler secret put` from keychain. Custom domain bound via CF API; cert auto-provisioned. Smoke tests green: unauth 401, member 200, POST round-trip persists, `/triage` returns a real Claude classification end-to-end.
- [x] Tokenized unguessable share-link mode: HMAC-SHA256 sign + verify primitive at `apps/worker/src/share-token.ts`; worker auth accepts share tokens as scoped-reporter identity. Tested with tamper-detection + expiry edge cases.
- [x] Reporter name prompt on first comment: `localStorageReporter` AuthAdapter + `setReporterName` / `clearReporterName` helpers + `reporterPrompt` config on drawer + overlay. Prompt blocks compose until a name is set; on submit, name persists to localStorage and adapters with `setCurrentUser` swap identity at runtime. Playground demo at `?reporter`.
- [x] Audit log hook: widget-side `onAudit` callback in `WidgetOpts` (fires on create/update/delete via the exported `wrapWithAudit` helper) + adapter-side `annotation_audit_log` table (worker writes on every mutation). Both layers independent; hosts pick either, both, or neither.
- [x] Bug-button auto-wire: `init({ onToggle })` callback in `bug-mode.ts` closes the manual shadow-root-attach workaround. Playground uses it as the canonical pattern.

**v0.2 complete** (2026-05-16): widget + adapters + worker + share-link tokens + reporter prompt + audit log + bug-button auto-wire + live worker at `eats.travisfixes.com`.

## v0.3: Host CMS integration (drawer mode)

- [x] Reference adapter (Pivotal's `eats-bugs-adapter.ts`) satisfying ApiAdapter + AuthAdapter + ThemeAdapter against a host CMS auth + D1 binding
- [x] Swapped Pivotal's hand-rolled `<PageNotesDrawer />` for `<AnnotationWidget renderMode="drawer" adapter={hostAdapter} />` (2026-05-18 in commit 62c323f via PR #167)
- [x] Preserved the existing `page_notes` table; widget reads same schema through the adapter
- [x] Smoke suite green (28/28 in Pivotal)
- [x] Staged on preview deploy first, dogfooded by Cole, then promoted
- [x] End-user sees no behavior change

**v0.3 complete** (2026-05-18): Pivotal is the canonical reference consumer at 0.0.7-alpha.0 in production.

## v0.4: Spatial-pin host integration (overlay mode)

- [x] Reference adapter for a spatial-pin consumer (LS's `eats-bugs-adapter.ts`; merged via lions-share PR #60)
- [x] Lion's Share uses `AnnotationPageMode` for click-to-pin overlay (deployed at 0.0.3-alpha.0 on lionsshare.travisfixes.com)
- [x] Per-host tinted theme via CSS custom properties: Pivotal red `#EC2127`, LS Mane orange `#C04618`. Note: drawer + helper overlays still need full host-palette inheritance, tracked in `docs/per-host-theming-2026-05-20.md`.

**v0.4 complete** (2026-05-19): LS deployed at 0.0.3-alpha.0; vendor bump to 0.0.7 sits on a docs branch pending merge + canary deploy under the Phase 2 plan.

## v0.5: Triage + capture + animation polish

- [x] Screenshot capture (`modern-screenshot`): `defaultScreenshotCapture` + `wrapWithScreenshot` helpers in `screenshot.ts`; `screenshotCapture` option on `WidgetOpts` plumbs through. Widget facade composes screenshot + audit wraps so drawer / overlay don't need to know. Adapters carry the `Annotation.screenshot` field. Default uses a data URL (demo-grade); hosts inject R2-upload variants for production.
- [x] AI triage `onCreate` hook (opt-in, no `ANTHROPIC_API_KEY` = no AI call): widget-side `wrapWithTriage` + `httpTriage` helpers; worker-side `POST /triage` route calls Claude (Sonnet 4.6 by default) with tool-use forced structured output, returns `{ severity, category, suggestedAssignee?, dupeOf?, rationale }`. Result writes back via a discriminated `{ triage }` UpdatePatch variant; persisted in dedicated columns via migration `002_triage.sql`. Reporter-mode (share-link) tokens get 403 on the triage route; only member tokens can spend Anthropic credits.
- [x] Sticky-note Motion polish (vanilla CSS, no Framer Motion dep): paper-grain texture via inline-SVG `feTurbulence` data URL (6% alpha) on `.draft` + sidebar `.card` surfaces. Per-marker rest tilt in [-0.5deg, 0.5deg] deterministic via djb2 hash of `id` so tilt stays stable across re-renders. Hover lift on markers + cards (composite-only transform + deeper shadow). Drag-to-reposition on spatial pins via pointer-capture; below the 5 px threshold the marker click-toggles selection, above it commits via a new `{ anchor: AnnotationAnchor }` UpdatePatch variant. The same variant lets route-anchored annotations be re-wired to a new selector / xpath when a stale CSS selector falls through. All motion gated on `prefers-reduced-motion`.
- [x] Real-DOM anchoring fully hardened against page mutations: triple-selector now full (CSS via `@medv/finder` + XPath + W3C text-quote + viewport box). Hosts that need to re-anchor a stale CSS selector can fall through to XPath or text-quote.
- [x] W3C Web Annotation Data Model conversion finalized: `toW3C` + `fromW3C` helpers in `packages/widget/src/w3c.ts`. Emits spec-valid JSON-LD with `@context: http://www.w3.org/ns/anno.jsonld`, `type: Annotation`, `motivation` (`commenting`, or `[commenting, assessing]` for severity=high), `TextualBody` body, `SpecificResource` target. Selector union maps cleanly: `selector` -> `CssSelector`, `xpath` -> `XPathSelector`, `textQuote` -> `TextQuoteSelector`, `viewport` -> `FragmentSelector` with pixel `xywh=`, spatial pins -> `FragmentSelector` with `xywh=percent:` conforming to W3C Media Fragments. Non-spec domain fields (state, severity, resolvedPR, triage, etc.) hang off a `teb:ext` extension block so consumers that don't know us still parse the document as a stock W3C annotation, and round-trip is lossless for consumers that do. Spec-only annotations missing `teb:ext` import cleanly with state defaulted to `open`. 16 unit tests cover round-trip + selector mapping + spec field-name conformance.

**v0.5 complete** (2026-05-16): all 6 items shipped.

## 0.0.2 to 0.0.7-alpha.0 sprint (2026-05-18 + 2026-05-19)

Real-world Cole-driven iteration inside Pivotal. Six releases in 48 hours.

- [x] **0.0.2-alpha.0** (B1): Sticky-note pins now page-scoped across soft navigation. New `route-watcher.ts` patches `history.pushState` + `replaceState` (idempotent); drawer + page-mode subscribe and re-call `refresh()` on every route change. Closed the bug where pins from `/bookings/A` rendered on top of `/bookings/B`.
- [x] **0.0.3-alpha.0** (F1): Optional kind radios (`bug` / `feature` / `note`) + Clear button in compose UI. `AnnotationKind` type, `Annotation.kind?` field, drawer + page-mode compose rows of radio pills with state reset on submit. Adapters that ignore the field stay backwards compatible.
- [x] **0.0.3-extra**: Re-export `AnnotationKind` from `@travisbreaks/travisEATSbugs` package root so adapter consumers (Pivotal) drop their local union duplicate.
- [x] **0.0.4-alpha.0** (F2): Drawer kind filter pills (`All` / `Bug` / `Feature` / `Note` / `Unclassified`) with live count badges. Per-pin kind coloring on page-mode (`teb-pin-bug` red, `teb-pin-feature` blue, `teb-pin-note` slate; `teb-pin-stale` gray wins). Pin `aria-label` carries kind for screen readers.
- [x] **0.0.5-alpha.0** (B2): Hide orphan pins entirely. Selector-no-longer-resolves pins no longer stack in a vertical column on the viewport edge. Drawer list still surfaces every note for the route.
- [x] **0.0.6-alpha.0** (B3): Pin durability via fall-through chain (selector -> xpath -> textQuote -> viewport `elementFromPoint`). Capture-time Tailwind-utility veto prevents `@medv/finder` from picking ambiguous utility-class selectors. `resolveTargetForAnchor()` returns `{ target, via }` so future host code can auto-heal anchors.
- [x] **0.0.7-alpha.0** (F3): Right-rail drawer layout option (`layout: 'right-rail'`) matching Pivotal's AI chat sidebar shape and the legacy `PageNotesDrawer`. New options: `railWidth`, `backdrop`. Floating layout unchanged (backwards compatible). Slide-in animation, left border + leftward drop shadow.

## Work-in-flight design docs (toward 0.0.8+)

These are captured Pivotal-side patterns + new strategic requirements that have not yet landed in canonical TEB. They guide the next releases.

- **`docs/per-host-theming-2026-05-20.md`**: drawer + helper overlays don't inherit host palette like the button does. Convert hardcoded colors in `drawer.ts` (and `bug-mode.ts`, `page-mode.ts`, `overlay.ts`) to CSS custom properties (`--teb-surface-1`, `--teb-surface-2`, `--teb-muted`, etc.). Estimated 5hr; targets 0.0.8-alpha.
- **`docs/note-threads-2026-05-20.md`**: two-way per-note communication. Cole files a note, admin asks a clarifying question, note becomes a thread. New `page_note_messages` table, adapter methods (`listMessages`, `addMessage`), threaded inbox UI, in-app indicator. Email/SMS dispatch is paid-tier (lands in `teb-cloud`). Targets 0.0.12 or later.
- **`docs/client-facing-tenancy.md`**: Phase A6 multi-tenant pilot for LSD. Ratified decisions D1-D4 baked into doc. Per-tenant routing via embed token, R2-hosted brand assets, per-tenant version pinning (LS = canary), auth-gated production widget (no random visitor sees zero).

## v0.8 and beyond (TEB OSS uplift per Phase 1 of the strategic plan)

Upstream Pivotal innovations not yet in canonical TEB. See `~/.claude/plans/okay-you-ve-opened-questions-humble-breeze.md` for the full sequenced plan.

- **0.0.8**: bug-button + mode-picker config (positioning, animation, modes array, `onModeChange`). Hint ribbon offset config.
- **0.0.9**: anchor rehydration built into widget default capture (selector + xpath on `Annotation.anchor`). `relatedIds` + `dupOf` as first-class fields.
- **0.0.10**: `onMutate` adapter hook for host audit unification. Bulk ingest endpoint at canonical worker.
- **0.0.11**: TEB MCP server (public-credibility marker). BugHerd MCP is "coming soon"; we ship a working one first.

## v0.6: Integrations (formerly v0.5)

- [ ] GitHub Issues two-way sync (comment becomes issue, issue close writes back to pin)
- [ ] Linear two-way sync
- [ ] Jira two-way sync
- [ ] Slack notification webhook

PR link-back specifically (`resolved_pr` column) ships earlier as a core primitive in v0.1. The v0.6 work is the full bidirectional ticket-sync layer on top.

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
