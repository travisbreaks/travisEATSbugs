# Lion's Share implementation guide

How the Lion's Share team adopts `@travisbreaks/travisEATSbugs` in place of the bespoke `<PinAnnotations />` (the 704-LOC component currently serving spatial-pin feedback on client mockups).

This guide is written for the engineer doing the cutover. It assumes familiarity with the existing pin-annotations component, the localStorage shadow-state pattern, the per-client tinted theme, and the `/tracks` aggregator that scores client engagement from pin activity.

Source-of-truth references:
- `docs/extraction-strategy-2026-05-15.md` (why the widget exists, what got consolidated)
- `docs/lions-share-pin-annotations-audit-2026-05-15.md` (full Lion's Share-side mapping)
- `packages/widget/src/types.ts` (the unified `Annotation` shape)
- `apps/worker/README.md` (REST contract + deploy runbook)

---

## What you're swapping

| Lion's Share today | After cutover |
|---|---|
| `<PinAnnotations />` (704 LOC) | `<AnnotationWidget renderMode="overlay" />` |
| localStorage-keyed pin store with shadow-state seeding | Either `LocalStorageAdapter` (zero backend) or `HttpAdapter` pointed at the worker |
| Hand-rolled drag handler with `pointermove` / `pointerup` | Built into the widget, with a 5 px click/drag threshold and a `{ anchor }` UpdatePatch variant |
| Per-client tinted theme via `--brand-*` CSS vars | Same; the widget reads through Shadow DOM |
| Faux mac-chrome header strip | `headerMode: 'mac-chrome'` config flag |
| `/tracks` reads pin counts + severity heuristic | Same; aggregator now reads through the adapter (or directly from localStorage / D1) |
| Manual sticky-note styling | Built-in: paper texture + per-pin rest tilt + hover lift |

The widget owns no I/O. You bring the adapter, the auth, and the per-client theme. The widget brings rendering + the full sticky-note Motion polish + drag-to-reposition + AI triage hook + W3C export.

---

## Phase 1: install + pick a backend

### 1a. Install

```bash
pnpm add @travisbreaks/travisEATSbugs
# pick one of:
pnpm add @travisbreaks/travisEATSbugs-http        # for the live worker
# OR keep localStorage-only (no extra package)
```

### 1b. Adapter choice

Lion's Share is currently localStorage-only. You have two options for cutover:

**Option A: localStorage (zero-backend, dev / single-machine demos)**

```ts
import { LocalStorageAdapter } from '@travisbreaks/travisEATSbugs'

const api = new LocalStorageAdapter({
  namespace: `lions-share.${clientId}`,  // per-client isolation
  currentUser: { id: 'cole', display: 'Cole' },
})
```

This matches today's behavior exactly: data lives in `localStorage`, no network calls. The widget hydrates lazily and tolerates quota errors silently (matching the existing pattern).

**Option B: HTTP adapter against the worker (multi-device, real sharing)**

```ts
import { HttpAdapter } from '@travisbreaks/travisEATSbugs-http'

const api = new HttpAdapter({
  baseUrl: 'https://eats.travisfixes.com',
  authorization: `Bearer ${memberToken}`,
})
```

This unlocks the share-link reporter flow (anonymous external reviewers can drop pins via a tokenized URL) and cross-device sync. The worker shape mirrors the localStorage adapter contract, so the widget code is identical; only the construction line changes.

Per Travis's 2026-05-15 decision: the planned localStorage-to-D1 intermediate step is skipped. Go straight to the widget adapter when ready.

### 1c. AuthAdapter (optional)

Lion's Share's reporter list is hand-curated. The default auth-stub returns a demo user; for production wire the same auth your existing app uses:

```ts
import type { AuthAdapter } from '@travisbreaks/travisEATSbugs'
import { getCurrentReviewer } from '@/lib/lions-auth'

export const lionsAuth: AuthAdapter = {
  async getCurrentUser() {
    const r = await getCurrentReviewer()
    return r ? { id: r.id, display: r.name, avatarUrl: r.photoUrl } : null
  },
  canAdmin(u) {
    return u.id === 'cole' || u.id === 'jesse'
  },
}
```

### 1d. Per-client theme

Keep your existing per-client `--brand-*` CSS variables at `:root`. The widget reads them through the shadow DOM via the `--teb-accent`, `--teb-success`, etc. variables. To bind your brand color to the marker pin accent, set:

```css
:root {
  --teb-accent: var(--brand-primary);
  --teb-success: var(--brand-success);
}
```

For more aggressive theming (font, surface gradient, sticky-note paper tint), see `packages/widget/src/overlay.ts` for the full set of `--teb-*` variables.

---

## Phase 2: swap `<PinAnnotations />` for `<AnnotationWidget renderMode="overlay" />`

Currently:

```tsx
import { PinAnnotations } from '@/components/pin-annotations'

export function MockupFrame({ src, clientId }: Props) {
  return (
    <div className="mockup-frame">
      <img src={src} alt="" />
      <PinAnnotations surfaceId={src} clientId={clientId} />
    </div>
  )
}
```

After cutover:

```tsx
'use client'
import { AnnotationWidget, LocalStorageAdapter } from '@travisbreaks/travisEATSbugs'
import { useEffect, useRef } from 'react'
import { lionsAuth } from '@/lib/lions-auth'

export function MockupFrame({ src, clientId }: Props) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!surfaceRef.current) return
    const widget = new AnnotationWidget({
      api: new LocalStorageAdapter({ namespace: `lions-share.${clientId}` }),
      auth: lionsAuth,
      renderMode: 'overlay',
      surface: surfaceRef.current,
      surfaceId: src,
      surfaceKind: 'screenshot',
      headerMode: 'mac-chrome',          // the faux-Chrome strip you already use
      showSidebar: true,
      initialFilter: 'open',
    })
    widget.mount()
    return () => widget.destroy()
  }, [src, clientId])

  return (
    <div className="mockup-frame">
      <img src={src} alt="" />
      <div ref={surfaceRef} className="pin-overlay" />
    </div>
  )
}
```

The `surface` element is the host for the shadow DOM. Pins are positioned relative to it via x/y percent, so the surface element's size + position determines pin placement. Use `aspect-ratio` or absolute positioning to lock it to the mockup image.

---

## Phase 3: parity verification + the new affordances

The widget has feature parity with `<PinAnnotations />` for every primitive, plus v0.5 polish on top:

| Feature | Lion's Share today | Widget |
|---|---|---|
| Click to drop a pin | yes | yes |
| Compose form anchored to the pin | yes | yes (with paper-texture sticky-note styling) |
| Sidebar list of pins | yes | yes (filterable: all / open / resolved) |
| Resolve / reopen | yes | yes |
| Mark duplicate | manual | yes (`dupOf` field) |
| Drag-to-reposition | yes (hand-rolled) | yes (pointer-capture, 5 px threshold, click-suppression) |
| Paper texture | partial | full (inline-SVG `feTurbulence`) |
| Per-pin rest tilt | no | yes (±0.5deg deterministic per pin id) |
| Hover lift | partial | full (composite-only transform + shadow lift) |
| Faux mac-chrome header | yes | yes (`headerMode: 'mac-chrome'`) |
| Reduced-motion gate | partial | full |
| Reporter mode (anon share link) | no | yes (`localStorageReporter` + worker share-token) |
| AI triage (auto severity / category) | no | yes (`wrapWithTriage` / `httpTriage`) |
| Screenshot capture at create time | no | yes (`screenshotCapture`) |
| W3C JSON-LD export | no | yes (`toW3C`) |

Smoke checklist:

- [ ] Pin drops on click; numbered marker appears at exact click position
- [ ] Compose form floats above the pin; CMD-Enter saves
- [ ] Sidebar list updates immediately
- [ ] Drag a pin: visual follows pointer, commits new position on release
- [ ] Click on a pin (no drag) toggles selection (no commit)
- [ ] Drag below 5 px threshold falls through to click behavior
- [ ] Resolve flips the marker color to green
- [ ] Reopen restores it to accent color
- [ ] Filter chips (all / open / resolved) hide/show pins correctly
- [ ] Per-pin rest tilt is stable across page reloads (same pin, same angle)
- [ ] Hover lift fires on marker + sidebar card; composite-only
- [ ] Mac-chrome header strip renders
- [ ] Per-client `--brand-*` color shows up on the markers
- [ ] Reduced-motion preference disables all motion
- [ ] Mobile pointer (touch) drag works (touch-action: none)
- [ ] Reporter mode (when wired): prompt blocks click-to-place until name set

---

## Phase 4: enable v0.5 (optional, after parity ships)

### Drag-to-reposition is on by default

No config needed. Any spatial pin is draggable. Route-mode pins stay anchored to their CSS selector (route pins aren't draggable; their position is computed from the DOM at render time).

If you want to **disable** drag on certain mockups (e.g. final-sign-off mode where positions should be frozen), the cleanest path is to render the widget with `auth.canAdmin` returning false for non-admins, then add a custom guard in your `AuthAdapter` that wraps writes:

```ts
// Or: just don't pass a wrapped adapter. The widget always allows drag if the
// underlying adapter accepts the { anchor } patch. For freeze mode, wrap the
// adapter to reject anchor patches.
function freezeAnchor(api: ApiAdapter): ApiAdapter {
  return {
    ...api,
    update: async (id, patch) => {
      if ('anchor' in patch) throw new Error('mockup is frozen; anchor changes not allowed')
      return api.update(id, patch)
    },
  }
}
```

### AI triage

```ts
import { httpTriage } from '@travisbreaks/travisEATSbugs'

const widget = new AnnotationWidget({
  // ... existing config
  triage: httpTriage({
    endpoint: 'https://eats.travisfixes.com/triage',
    headers: { authorization: `Bearer ${memberToken}` },
  }),
})
```

Particularly useful for Lion's Share: clients leave a lot of pins, many overlapping. The triage `dupeOf` field surfaces duplicates the moment they land. The `category` field powers the `/tracks` aggregator's per-category engagement score.

### Screenshot capture

For Lion's Share, the canonical surface is already an image, so screenshot capture is less critical than for Pivotal. If you do want it (e.g. to capture the surface element including pins for an exported PDF), use `defaultScreenshotCapture` or write your own that uploads to your CDN.

### W3C export

A natural feature for client deliverables: at the end of a review cycle, export the full annotation set as JSON-LD that the client can ingest into their own annotation tool, hypothes.is, or a static site. The `teb:ext` extension block preserves resolution / triage / overlap state for round-tripping; spec consumers ignore it.

### `/tracks` aggregator integration

Today `/tracks` reads localStorage directly and computes a heuristic. The cutover path:

1. Replace the direct localStorage read with `api.list({ state: 'all' })` from the adapter you chose in Phase 1.
2. Keep the existing heuristic (3-day client-authored window, severity weighting). The `Annotation.severity` field exists for exactly this; pass `inferSeverity` via the `theme` config to preserve the current logic.
3. (Optional v0.5 upgrade) Read `annotation.triage.category` and `.severity` from the AI triage column instead of inferring. This lights up only after triage has been enabled and run on the existing pins.

---

## Per-client theme tinting (preserve)

Lion's Share's most distinct visual feature: per-client tinted theme. The widget honors this by reading `--teb-*` CSS variables on `:root`. Map your existing brand vars to the widget vars at the per-client surface:

```tsx
<div
  className="client-surface"
  style={{
    '--teb-accent': clientPalette.primary,
    '--teb-success': clientPalette.success,
    '--teb-fg': clientPalette.foreground,
  } as React.CSSProperties}
>
  <MockupFrame ... />
</div>
```

The widget's shadow DOM inherits these via `var()` chains, so per-client surfaces get tinted without a re-build.

---

## Rollback plan

1. **Soft rollback**: revert the `<PinAnnotations />` swap (Phase 2). The widget unmounts cleanly. localStorage data is unchanged; the existing component reads it back.
2. **No hard rollback needed**: the widget makes no schema changes to localStorage. The keys (`travisEATSbugs:lions-share.<clientId>`) are namespaced; they don't collide with existing keys. If you want to wipe widget-side data without touching the old pins, delete keys with the `travisEATSbugs:` prefix.

If you migrated to the HTTP adapter in Phase 1 and want to roll back to localStorage, run a one-time export:

```ts
const all = await httpAdapter.list({ state: 'all' })
localStorage.setItem(`travisEATSbugs:lions-share.${clientId}`, JSON.stringify(all))
```

Then swap the adapter line back. The widget re-hydrates from localStorage and continues.

---

## Open questions

These are not blockers, but flag them before the flip:

- Do you want shared backend (worker at `eats.travisfixes.com`) for cross-device pin sync, or stay on localStorage? The widget supports both; the call is product-level, not technical.
- Should AI triage run for all clients, or only on internal Lion's Share projects? Triage costs Anthropic credits; the worker is opt-in per-host.
- Pin density: with very busy mockups (>30 pins), the rest tilt may start to read as noise. Consider gating tilt on `pin-count < 30` in the widget CSS if it becomes a visual issue.
- W3C export for client deliverables: do you want a download button in the admin UI? Trivial wire: call `toW3C(annotation)` per item, package as `AnnotationCollection`, hand back as `application/ld+json` blob (see `apps/playground/app/page.tsx` for the pattern).
