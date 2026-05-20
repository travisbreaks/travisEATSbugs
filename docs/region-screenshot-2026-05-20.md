# TEB region screenshot capture (Apple Shift+4 style)

**Status:** open. Captured from Travis 2026-05-20 (Pivotal-Cole context).
**Priority:** medium. BugHerd parity feature, useful in some workflows.
Was initially scoped "high" until a Pivotal-side incident reframed the
problem (see "What the Pivotal #106-#109 case taught us" below).
**Related:** [`note-threads-2026-05-20.md`](note-threads-2026-05-20.md),
[`per-host-theming-2026-05-20.md`](per-host-theming-2026-05-20.md),
[`client-facing-tenancy.md`](client-facing-tenancy.md).

## The need

Cole files notes on Pivotal. Sometimes the body is ambiguous. Travis or
the admin wants to ask "which element / which row / which screen" but
the pin's selector alone doesn't always carry that signal (a pin can be
anchored to a header div even when the actual confusion is in the cell
3 rows down).

BugHerd's solve: every report ships with a screenshot. The reporter
selects a region (BugHerd has a built-in selector that looks like
Apple Shift+4), the screenshot becomes part of the report, the admin
sees exactly what the reporter saw.

Travis's framing (paraphrased): "I hate to be asking Cole for
screenshots. I want us to have screenshot capability built into our
tool because that's what he's going to come back with."

Plus a deeper observation: the point of pins was to remove the need
for clarification by capturing the exact element. When we still need
to ask for clarification, it means the capture wasn't complete enough.
Two paths to fewer round-trips:

1. Better capture at compose time (this doc: region screenshot).
2. Better AI inference at triage time (the AI triage pipeline reduces
   the "I need to ask" rate by self-resolving more cases).

Both compound. Ship both.

## What already exists in TEB

The widget shipped a screenshot integration at 0.0.5
(`packages/widget/src/screenshot.ts`):

- `defaultScreenshotCapture()`: full-page screenshot via
  [`modern-screenshot`](https://github.com/qq15725/modern-screenshot)
- `wrapWithScreenshot(api, capture)`: composes the screenshot into
  the create call, persists onto `Annotation.screenshot`
- `WidgetOpts.screenshotCapture` option exposes the hook

This is **automatic full-page capture on every new pin**. Useful as a
fire-and-forget default. But it's not what Cole's flow needs.

What Cole's flow needs: **user-initiated region selection**. The
reporter clicks "add screenshot" in the compose card, the screen
darkens, drag-to-select a region, release commits the screenshot to
the pin. Lower bandwidth (region vs full page), higher signal
(reporter actively chooses what matters).

Both modes should coexist. Auto-capture stays the default; region
selector is opt-in via a "screenshot" button in the compose card.

## The UX

Match the macOS Shift-Cmd-4 mental model since it's the universal
reference:

1. Reporter clicks the bug button, lands on an element, sees the
   compose card.
2. Compose card has a "Screenshot" button below the textarea.
3. Click "Screenshot": compose card collapses to a small "Selecting
   screenshot..." pill, page enters region-select mode:
   - Cursor changes to crosshair
   - Overlay dims the page slightly (rgba(0,0,0,0.15) on a fixed
     overlay div inside shadow DOM)
   - Pointer-down + drag draws a selection rectangle with the host's
     accent color
   - Live coordinates ("234 x 178") shown near the cursor
   - Escape cancels (compose card re-expands, no screenshot attached)
4. Pointer-up commits: that rectangle of the page becomes the
   screenshot, the compose card re-expands with the screenshot
   inline as a thumbnail above the textarea.
5. Click the thumbnail: full-size preview opens; click again to
   collapse.
6. Reporter submits the pin with the region screenshot attached.

This is additive on top of the existing auto-capture default. The
ApiAdapter persists `Annotation.screenshot` exactly as today; the
worker uploads to R2 (host-configured); the admin sees the
screenshot in the inbox.

## Implementation shape

### Widget side

New module `packages/widget/src/region-screenshot.ts`:

- `captureRegion(): Promise<string>`: returns a data URL of the
  selected region. Resolves on pointer-up; rejects on Escape.
- Internals: shadow-DOM overlay (separate from page-mode's overlay),
  pointer-capture, draws selection rect on a 2D canvas, on release
  uses `modern-screenshot` with viewport clipping to capture just
  the selected coords.

Compose-card integration in `drawer.ts` + `page-mode.ts`:

- New "Screenshot" button in the compose row
- `composeScreenshot: string | null` state per surface
- On commit: `CreateInput.screenshot = composeScreenshot ?? (default capture)`

### Adapter / worker side

No changes needed. `Annotation.screenshot` is already part of the
shape. Adapters that round-trip it (Pivotal already does; LS will
once it catches up) will store the region screenshot the same way
they store the auto-capture.

For tenant-scoped widgets (Phase 2 LS A6 pilot): R2 upload of the
screenshot blob lands in `r2://<bucket>/tenants/<tenant>/screenshots/<note-id>.png`.

## Effort estimate

- Region selector module + tests: 3-4 hr
- Compose card UI integration (drawer + page-mode): 2 hr
- Playground demo + visual QA: 1 hr
- Documentation pass: 30 min
- Build + vendor + smoke into Pivotal staging: 1 hr

Total: ~8 hr focused work. Targets `0.0.13` or whenever it fits in
the Phase 1 sequence.

## Acceptance criteria

- Reporter on Pivotal can click "Screenshot" in compose, draw a
  region, release, and submit a pin with the region screenshot
  attached.
- Admin in `/admin/page-notes-inbox` sees the screenshot inline on
  the note row.
- Escape cancels cleanly with no orphan state.
- Auto-capture still fires for pins that don't use region select
  (backwards compatible).
- Works in both `drawer` and `page-mode` compose surfaces.
- Bundle size delta < 3 KB gzipped.
- Tests cover: region commit, Escape cancel, simultaneous
  auto-capture-and-region (region wins).

## What the Pivotal #106 to #109 case taught us

Same day this doc was drafted, Pivotal Cole filed four notes:

- #106 "Move Status to left of Date"
- #107 "City should just be the city"
- #108 "State should just be the state"
- #109 "address can be under venue"

The Pivotal thread initially drafted screenshot/clarification asks to
Cole. Then it looked at the actual data:

```
venueAddress: "6 W. 6th Street, St Paul, MN 55102, United States"
venueState:   "St Paul, MN"     ← city + state COMBINED
venueCom:     "Amsterdam Bar & Hall"
```

Plus the grid code (`queries.ts:4088-4089`):

```js
city:  str(o.venueAddress) ?? str(o.city)   // shows full street in City
state: str(o.venueState)   ?? str(o.state)  // shows "St Paul, MN" in State
```

So Cole's grid was rendering:

- **City column** = full street address (because it fell through to venueAddress)
- **State column** = "St Paul, MN" (city + state combined)
- **Venue column** = "Amsterdam Bar & Hall"

Once you look at the data, all four notes are unambiguous:

- #106: simple header reorder (pin pointed to `th:nth-child(3)` = Status header)
- #107: parse `venueState` on last comma, take the left side
- #108: same parse, take the right side
- #109: move `venueAddress` out of City and render under the Venue cell

Zero clarification needed. All four shippable as one PR. The pin
selectors plus the source data made the entire problem decidable.

**The takeaway:** the pin did its job. The clarification draft was a
process failure (the admin / AI agent didn't look at the source data
hard enough before asking), not a tool failure.

This reframes the screenshot feature. It's still useful (BugHerd
parity, helps when the pin element itself doesn't carry the visual
information needed), but it's NOT the silver bullet for "we need to
ask Cole less." The actual fix lives at a different layer.

## The real "need to ask less" stack

Three layers in order of leverage:

1. **Source-data analysis as a precondition to clarification (highest
   leverage).** Any agent or admin drafting a clarification question
   must first inspect the underlying data the pinned element renders.
   For the AI triage pipeline (Phase 3 paid tier), this becomes a
   prompt constraint: "Before requesting clarification, you MUST have
   examined: (a) the pin's selector + xpath against the live DOM, (b)
   the source row(s) the pinned element renders from in the host's
   data layer, (c) any adjacent rows that share the same render path.
   Only after all three are inspected and ambiguity persists may you
   request clarification."

2. **Better in-thread asking when we DO need to ask** ([`note-threads-2026-05-20.md`](note-threads-2026-05-20.md)).
   The threading + push-notification mechanic makes asking lower
   friction. First legitimate use Travis identified: posting "shipped:
   see PR #N" replies on resolved notes (no clarification needed,
   pure status update). That's how note-threads earns its keep on day
   one regardless of clarification volume.

3. **Better capture at compose time (this doc).** Region screenshot
   helps when the visual context isn't reachable via the pin's
   selector (cross-element relationships, "this is too cramped",
   "these two are misaligned"). Useful, but a niche.

The three compound. Region screenshot is the lowest-leverage of the
three for the "fewer clarifications" goal. It's still worth shipping
for BugHerd parity and for the visual-only cases, but it's not the
highest-priority Phase 1 task. The AI-triage prompt constraint (layer
1) gets bigger results for less effort.

## When this lands

Targets one of the 0.0.x releases in Phase 1. Effort fits in a half-
day plus visual QA. Order can be: 0.0.8 (mode picker + bug button
config) → 0.0.9 (anchor rehydration + relatedIds) → 0.0.10 (onMutate
hook + bulk ingest) → 0.0.11 (TEB MCP server) → 0.0.12 (note threads
data model) → **0.0.13 (region screenshot)**.

Or pull this earlier if Cole asks for it Friday. It's small enough to
slot in.
