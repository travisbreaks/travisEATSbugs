# travisEATSbugs: Known issues + consumer bug reports

Cross-consumer bug tracker for the widget. When a consumer (Pivotal, Lion's Share, future) finds a bug, log it here so the fix lands in the canonical widget and flows back out to every consumer on the next release.

## Workflow

1. Consumer discovers a bug in the widget on their site.
2. Open a new section under "Open" below with: short title, date, consumer, repro steps, expected vs actual.
3. Fix in TEB; bump version; rebuild + pack; re-vendor in each consumer.
4. Move the entry from "Open" to "Fixed" with the version it landed in.

When a fix lands here:
- `pnpm --filter @travisbreaks/travisEATSbugs run build`
- `cd packages/widget && npm pack`
- Copy the new `.tgz` into each consumer's `app/vendor/` (or whatever vendor path) and `npm install` in the consumer.
- Each consumer redeploys.

The version bump is the contract that signals "consumer should re-vendor". When you ship a fix without bumping, consumers won't notice they should pull a new copy.

## Versions

| Version | Date | Headline | Schema requires |
|---|---|---|---|
| 0.0.7-alpha.0 | 2026-05-19 | Drawer layout option (F3): `layout: 'right-rail'` renders a full-height side drawer with slide-in animation + optional backdrop, matching Pivotal's AI chat sidebar shape and the legacy PageNotesDrawer | (no new columns; UI-only) |
| 0.0.6-alpha.0 | 2026-05-19 | Pin durability (B3): fall-through chain selector -> xpath -> textQuote -> viewport when a stored selector is ambiguous, plus capture-time Tailwind-utility veto so finder picks structural selectors | `anchor.xpath` (already present as `xpath TEXT NULL` from 0.0.1 schema; B3 hardens use of it) |
| 0.0.5-alpha.0 | 2026-05-19 | Hide orphan pins (B2) so dead-selector pins stop stacking on the viewport edge | (no new columns) |
| 0.0.4-alpha.0 | 2026-05-19 | Drawer kind filter + per-pin kind coloring on page-mode (F2) | `kind TEXT CHECK ('bug'\|'feature'\|'note' NULL)` (from 0.0.3) |
| 0.0.3-alpha.0 | 2026-05-18 | Optional kind radios (bug / feature / note) + Clear in compose UI (F1) | `kind TEXT CHECK ('bug'\|'feature'\|'note' NULL)`. **Without this column, adapters silently drop kind on save.** Pivotal: mig 068. LS: pending mig 054. |
| 0.0.2-alpha.0 | 2026-05-18 | Route-refresh fix (B1) | (no new columns) |
| 0.0.1-alpha.0 | 2026-05-14 | Initial extraction from Pivotal | Base schema: `id`, `page_path`, `author_id`, `body`, `created_at`, `modified_at`, `state`, `resolved_pr`, `resolved_at`, `resolved_by`, `resolution_note`, `related_ids` (JSON), `dup_of`, `x_pct`, `y_pct`, `selector`, `xpath` |

## Open

_None tracked at the moment. Add new entries here as they come in._

## Features shipped (non-bug additions)

### F3 - Right-rail drawer layout option [0.0.7-alpha.0]

**Asked:** 2026-05-19 by Travis (consumer: Pivotal).
**Why:** The pre-EATS hand-rolled `<PageNotesDrawer />` in Pivotal was a full-height right-rail drawer (`fixed top-0 right-0 h-full w-[420px]`), visually paired with the AI chat sidebar. The EATS widget defaulted to a small bottom-right floating panel which felt like a different (and lesser) affordance to Cole. Consumers should be able to pick which layout fits their host UX.
**Shape:**
- New `DrawerOpts.layout: 'floating' | 'right-rail'` (default `'floating'`, backwards compatible for Lion's Share + other consumers).
- New `DrawerOpts.railWidth` (default 420) to match Pivotal's AI sidebar width.
- New `DrawerOpts.backdrop` (boolean, default false): when true + layout='right-rail', renders a translucent backdrop behind the rail; clicking it closes the drawer (Pivotal AI sidebar dismiss pattern).
- Right-rail panel: `position: fixed; top: 0; right: 0; bottom: 0; width: railWidth; max-height: 100vh`; slide-in from right (`translateX(100%) -> translateX(0)`) animation; left border + leftward drop shadow.
- Floating layout unchanged.
**Consumer action:** pass `layout: 'right-rail'` (plus optional `backdrop: true`) to `new AnnotationWidget({ ... })` or `new AnnotationDrawer({ ... })`.

### F2 - Drawer kind filter + per-pin kind coloring [0.0.4-alpha.0]

**Asked:** 2026-05-19 by Travis as the two F1 follow-ups (kind filter UI in drawer list + per-pin kind badge on page-mode markers).
**Why:** F1 added the metadata (kind on every annotation) but left the reporter no way to actually use it: drawer lists every kind mixed together, page-mode pins all looked identical regardless of classification. Filter scopes the drawer down to one kind at a time (or "unclassified" for legacy / no-kind notes). Per-pin coloring lets the reporter visually scan the page and see the distribution of bug / feature / note pins at a glance without opening each.
**Shape:**
- Drawer: row of 5 filter pills above the list (All / Bug / Feature / Note / Unclassified) with live count badges per pill. Active pill is highlighted with the accent color. The row hides entirely when there are zero items so empty drawers don't show a hollow control. Default filter is `all`.
- Page-mode pins: pin background colors by kind (`teb-pin-bug` red, `teb-pin-feature` blue, `teb-pin-note` slate gray). Unclassified pins keep the default accent pink. The `teb-pin-stale` class (gray) still wins over kind classes, so a broken-selector pin reads as stale regardless of its kind.
- Pin `aria-label` now includes the kind in parentheses for screen readers (`Open feedback 3 (bug)`).
- MemoryAdapter rounded-tripped to round-trip kind through create + the `{ kind: AnnotationKind | null }` PATCH variant. Without this, the F1 metadata was disappearing on every adapter that wasn't custom-wired (tests, playground).
**Consumer action:** Drop the new `.tgz` and redeploy. The drawer filter row appears automatically; per-pin coloring lights up for any annotation that already has `kind` set. Adapters that already round-trip kind (Pivotal's via mig 068 + `eats-bugs-adapter.ts`) get both features end-to-end.

### F1 - Optional kind radios + Clear in compose UI [0.0.3-alpha.0]

**Asked:** 2026-05-18 by Cole. Gemini-notes phrasing from the call: "radio button or toggle for bug, feature request, or note categorization." Travis iMessage clarification: "tick boxes in the note itself (optional)." Three classifications: bug / feature / note. Single-select (radio) with an explicit Clear button so the no-classification path still works.
**Why:** Cole's brain-dump flow benefits from a quick way to tag what kind of thing he's reporting. Travis: "another piece of metadata that you could filter by in the list." Single-select matches Cole's "categorization" intent (a note IS a bug, OR a feature, OR a generic note, not both) while Clear preserves the optional path.
**Shape:**
- New `AnnotationKind = 'bug' | 'feature' | 'note'` type.
- `Annotation.kind?: AnnotationKind` optional, single value.
- `CreateInput.kind?` and a new `UpdatePatch` variant `{ kind: AnnotationKind | null }`.
- Drawer compose: row of 3 radio pills + a small Clear button above the Send row. State resets on submit; restored on submit-error so the reporter doesn't lose it. Clear button is hidden when no kind is selected.
- Page-mode compose: same row of radio pills + Clear, themed for the BugHerd-style card. Independent state from the drawer's compose (each surface has its own `composeKind`).
- Drawer list items: single colored badge (Bug = red, Feature = blue, Note = neutral) below the body.
- Page-mode view card: same single badge above the body.
**Consumer action:** Adapters that want to persist + round-trip `kind` need to surface the field. Adapters that ignore the field stay backwards compatible; UI shows radios but `kind` gets dropped on the wire. Pivotal adapter update lands in a separate PR (Pivotal repo).

## Fixed

### B3 - Pins anchor to the wrong element when selectors are utility-class noise [0.0.6-alpha.0]

**Reported:** 2026-05-19 by Cole via Travis (consumer: Pivotal).
**Symptom:** After the 0.0.5 orphan-hide ship, pins on `/` still rendered in visibly wrong positions. Specifically Cole had 3 pins clustered at the top of the dashboard but the markers were over different cards than the ones he originally clicked.
**Root cause:** Two compounding bugs.

1. `@medv/finder` was selecting Tailwind utility classes as the "shortest unique selector". Stored selectors like `.items-start:nth-child(2)`, `.border:nth-child(1)`, and `.min-h-\[180px\]:nth-child(6)` match dozens of elements across a typical page because the utility classes describe styling, not identity.
2. `resolveTarget` used `document.querySelector(selector)` which returns the FIRST match. With ambiguous selectors, that first match is almost never the intended target, yielding "anchored but wrong" pins.

**Fix:**

- **Resolve-time disambiguation:** rewrote the resolution chain. When the stored selector matches multiple elements, fall through to xpath (the strongest structural signal). If xpath also misses, fall through to textQuote (W3C-style exact + prefix/suffix from the original capture, walks text nodes to find candidates). If text misses too, fall through to a viewport-coordinate `elementFromPoint` last resort. Only the orphan case (every fallback fails) hides the pin.
- **Capture-time selector quality:** pass `@medv/finder` a `className` predicate that vetoes Tailwind utility patterns (TW_UTILITY_PREFIXES blacklist plus the `[...]`, `:`, and `\:` shapes that arbitrary values + variant prefixes use). With every utility class vetoed, finder falls back to tagName + structural position which survives DOM rebuilds.
- **Resolve telemetry:** `resolveTargetForAnchor()` returns `{ target, via }` so future host code can detect when a pin resolved through a fallback (signal for auto-heal: PATCH the anchor with the now-known correct selector so subsequent renders are fast).

**Consumer action:** re-vendor 0.0.6 and redeploy. Existing pins with utility-class selectors will still resolve correctly via the new fall-through; net effect is "pins land back in the right spot". New pins captured against the live DOM use the structural selector so subsequent rebuilds keep them anchored.

### B2 - Orphan pins stack on viewport edge when selectors break [0.0.5-alpha.0]

**Reported:** 2026-05-19 by Cole via Travis (consumer: Pivotal).
**Symptom:** On `/` (Pivotal dashboard) Cole saw 12 numbered red pins stacked vertically along the left edge of the viewport with no apparent target. Looked broken.
**Root cause:** When a pin's stored CSS selector / xpath no longer resolves on the current DOM (page has been refactored since the pin was placed), `rebuildPinViews()` fell through to the orphan-tray fallback `vx: 16, vy: 16 + N*36`, which stacked every dead-anchor pin in a column. Coupled with the new 0.0.4 per-pin kind coloring, the result was a visually prominent column of "broken" markers on every page that had drifted.
**Fix:** Skip rendering orphan pins entirely. `if (!pin.target) continue` before creating the DOM node; CSS now also has `display: none !important` on `.teb-pin-stale` as belt-and-suspenders for the in-flight orphan case (a pin whose target was alive at mount but disappeared during the session). The drawer list view still surfaces every note for the route, so the note data isn't lost; only the on-page marker disappears. Ships in 0.0.5-alpha.0.
**Consumer action:** Pivotal re-vendors 0.0.5 and redeploys.

### B1 - Sticky-note pins not page-scoped across soft navigation [0.0.2-alpha.0]

**Reported:** 2026-05-18 by Travis (consumer: Pivotal)
**Symptom:** After click-to-place pins on `/bookings/A`, navigating to `/bookings/B` via Next.js Link still rendered the `/bookings/A` pins on top of the `/bookings/B` DOM. Same shape applied to the drawer's note list.
**Root cause:** Both `AnnotationPageMode#refresh()` and `AnnotationDrawer#refresh()` only ran on mount. The default `routeFilter` / `anchorQuery` reads `window.location.pathname` at call time, but neither component subscribed to soft-navigation events (`pushState` / `replaceState`) that frameworks like Next.js, React Router, and Vue Router use. `popstate` alone misses every soft navigation.
**Fix:** New `route-watcher.ts` module patches `history.pushState` + `replaceState` once (idempotent), bridges them with native `popstate`, and exposes `onRouteChange(cb)`. Both drawer and page-mode subscribe on mount; on each route change they cancel any in-progress compose (anchored to the old page) and re-call `refresh()`. 7 new tests cover the patch behavior. Lands in 0.0.2-alpha.0.
**Consumer action:** Pivotal re-vendored the new `.tgz` and redeployed. No code changes needed in the host adapter.

## Dev workflow

See `docs/dev-workflow.md` for the canonical recipe when iterating on the widget while it's actively consumed by Pivotal + Lion's Share.

## Known limitations (not bugs)

- **0.0.x signals pre-stable.** Breaking changes in CreateInput / Annotation are allowed without major bumps until 0.1.x. Pin to exact `file:vendor/...tgz` paths in consumers to avoid surprises.
- **No filter UI yet** for the `kind?: 'bug' | 'feature' | 'note'` metadata. Tracked as a feature, not a bug.
- **Toggle between drawer-default and overlay-default at runtime.** Currently requires mounting both `AnnotationWidget({renderMode:'drawer'})` and `AnnotationPageMode` in parallel (which is what Pivotal does). A first-class "switch render mode" UI in the widget is on the roadmap.
