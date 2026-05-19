# travisEATSbugs — Known issues + consumer bug reports

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

| Version | Date | Headline |
|---|---|---|
| 0.0.3-alpha.0 | 2026-05-18 | Optional kind radios (bug / feature / note) + Clear in compose UI (F1) |
| 0.0.2-alpha.0 | 2026-05-18 | Route-refresh fix (B1) |
| 0.0.1-alpha.0 | 2026-05-14 | Initial extraction from Pivotal |

## Open

_None tracked at the moment. Add new entries here as they come in._

## Features shipped (non-bug additions)

### F1 — Optional kind radios + Clear in compose UI [0.0.3-alpha.0]

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

### B1 — Sticky-note pins not page-scoped across soft navigation [0.0.2-alpha.0]

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
