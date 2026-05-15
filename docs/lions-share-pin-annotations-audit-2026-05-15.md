# Lions Share pin-annotations audit

Date: 2026-05-15
Audited tree: `/Users/travisbonnet/code/CODE/lions-share/app-cf/`
Purpose: catalog the v0.7 pin-annotations component so we can fold its primitives into `@travisbreaks/travisEATSbugs` and have Lions Share consume the widget back via adapter.

---

## 1. PinAnnotations component

File: `src/components/pin-annotations.tsx` (704 lines)
Status: v0.7 production. v0.8 will wire D1 + drag + widget ingestion.

Props:
```ts
{
  pins: Pin[];
  stagingUrl?: string;
  clientName: string;
  clientSlug: string;
  currentUserDisplay?: string;  // default 'Travis'
}
```

State slices:
- `filter`: `'all' | 'open' | 'resolved'`
- `selectedId`: which pin card is expanded inline
- `localPins`: user-created pins, ephemeral until next write-through
- `resolvedSeededIds`: shadow set; seeded pins flipped to resolved
- `reopenedSeededIds`: shadow set; originally-resolved seeded pins flipped back open
- `draft`: in-progress pin creation `{ x, y, label }`
- `hydrated`: SSR-safe localStorage read guard

Click-to-place flow:
```ts
const x = ((e.clientX - rect.left) / rect.width) * 100;
const y = ((e.clientY - rect.top) / rect.height) * 100;
const clampedX = Math.max(4, Math.min(96, x));
const clampedY = Math.max(8, Math.min(94, y));
setDraft({ x: clampedX, y: clampedY, label: '' });
```

Submit appends `{ id: 'local-${Date.now()}', x, y, state: 'open', author: firstWordOfDisplay, createdAt: 'just now', label }` to `localPins` and triggers a write-through useEffect.

Persistence:
- Key: `lions-share-pins-${clientSlug}` (per-client scoped).
- Shape: `{ localPins, resolvedSeededIds: string[], reopenedSeededIds: string[] }`.
- Write timing: every dep change in `[localPins, resolvedSeededIds, reopenedSeededIds]`.
- SSR-safe: initial render uses empty defaults; hydration in mount useEffect.
- Failure: quota / private-browsing errors swallowed; state stays in memory.

Resolve/reopen:
- Local pins flip `state` in place + stamp `resolvedAt = 'just now'`.
- Seeded pins never mutated; toggles tracked in `resolvedSeededIds` / `reopenedSeededIds` Sets; `mergedSeeded` useMemo overlays them at read time.

Filter behavior: `visiblePins` useMemo filters by state; badge counts reflect filtered pins; overlay + sidebar both consume the filtered set; empty state copy "No markers in this filter."

Inline thread: when selected, optional `p.thread` renders as italic supplementary text below the label. Read-only, no edit.

## 2. Pin type + seed data

File: `src/lib/lions-clients.ts` (605 lines)

```ts
export type Pin = {
  id: string;              // 'gm-p-1' (seeded) | 'local-${ts}'
  x: number;               // 0-100, % of canvas width
  y: number;               // 0-100, % of canvas height
  state: 'open' | 'resolved';
  author: string;          // 'jesse' | 'travis' | 'client' | custom
  createdAt: string;       // '7d' | '3d' | 'just now' | ISO
  resolvedAt?: string;     // only when state === 'resolved'
  label: string;
  thread?: string;         // optional one-line context
};
```

Pins live as an optional array on `LionsClient` (one-to-many, denormalized). No cross-client references. No phaseId / blockerId linkage; pins are orthogonal to project lifecycle.

Severity: not on the pin shape; inferred downstream at `/tracks` (rule: `author === 'client' && ageDays >= 3` → high, else medium).

## 3. Reviews-tab integration

File: `src/app/pack/[client]/build/page.tsx` (825 lines)

Mount lives in `ReviewsTab` (lines 775-805): hydrates `client.pins ?? []`, passes through to `PinAnnotations`. Page-level header strip shows "{open} open · {total} total". One of six tabs (Status / Build / Files / Reviews / Threads / Activity). Reviews is fully isolated from phase / blocker / activity data; it's a pure annotation surface.

Workspace context sets `--accent: primary` on a `data-space={client.slug}` wrapper so each client's tinted palette flows into the component automatically.

## 4. `/tracks` aggregator

File: `src/app/tracks/page.tsx` (307 lines)

Read-only consumer. Iterates `LIONS_CLIENTS`, pulls every blocker and every `state === 'open'` pin (resolved pins dropped). Pins converted to rows with severity inferred per the 3-day-client-authored rule. Rows sorted by severity then `daysOpen DESC`, then bucketed Today (≤ 1d) / This week (1-7d) / Later (> 7d). Each row's `href` deep-links back to `/pack/${client.slug}/build?tab=reviews`.

## 5. Lions Share vs Pivotal at a glance

| Dimension | Lions Share v0.7 | Pivotal v2 (live) |
|---|---|---|
| Persistence | localStorage → D1 (v0.8) | D1 immediately |
| Anchor model | x, y % of faux canvas | page_path (route) |
| Render | overlay on staging chrome | floating drawer (real DOM) |
| State | `'open' \| 'resolved'` + toggle | open/resolved/overlap (v2) |
| Severity | inferred at /tracks (3d-client rule) | none in v0; not yet inferred |
| Author | display-name string | author_id (FK to app_users) |
| Scope | per-client | per-page-per-user |
| Resolution | toggle, optional resolvedAt | resolved_pr + resolved_at + resolved_by + resolution_note |
| Overlap | not modeled | related_note_ids + dup_of_note_id (v2 mig 058) |
| Thread | optional immutable one-liner | none in v0; planned |
| Audit log | none | every mutation logged |

## 6. Hardcoded Lions-Share-isms

Brand: NONE in the component. All colors via CSS custom properties (`--accent`, `--status-success`, `--text`, ...) defined at the page level on a `data-space` wrapper. Component is brand-neutral by construction.

Exception: macOS traffic-light hex values are hardcoded for the faux-Chrome aesthetic (`#FF5F57`, `#FEBC2E`, `#28C840`). Those are part of the design illusion, not Lions Share branding.

Fonts: `var(--font-mono)`, `var(--font-sans)`, `var(--font-serif)`. No hardcoded families.

Copy: only the footer line ("Local state via localStorage · travisEATSbugs ingestion + D1 sync land in v0.8") mentions product. Everything else is product-agnostic.

Animation: references `spin-canon` keyframe defined in app globals.css. Generic spinner that could either ship with the widget or be parameterized.

## 7. Irreducible primitive (Lions Share side)

Core capabilities to fold into the shared widget:
- Spatial anchor mode (x, y %) for screenshot / faux-canvas surfaces
- Overlay render mode (positioned markers on a canvas) parallel to the drawer mode
- Toggle resolve verb with shadow-state pattern (preserve immutable seed data)
- Severity inference adapter (host app supplies the rule, e.g., "client-authored + age >= 3d → high")
- Author display-name model (no auth wall in the widget)
- Inline thread / context surface (immutable in v0, editable later)
- Theme via CSS custom properties (already done)
- Browser-chrome chrome strip as an optional `headerMode` (faux staging window)
- Cross-surface aggregator hook (/tracks-style severity-grouped consumer)

What stays in Lions Share (not extracted):
- `lions-clients.ts` seed shape (host-specific data fixture)
- Staging URL derivation heuristic
- The footer copy and product-specific microcopy
- The `/tracks` route and its severity rule (host-specific aggregator)

## 8. Convergence sketch (Lions Share side)

The widget needs to support both anchoring modes:
- `anchor: { mode: 'route', path: string, selector?: string, textQuote?: ..., viewport?: ... }` (Pivotal / real-DOM)
- `anchor: { mode: 'spatial', x: number, y: number, surface: 'screenshot' | 'canvas' }` (Lions Share / faux-Chrome)

And both render modes:
- `renderMode: 'drawer'` (Pivotal: floating button, drawer panel, scoped to current route)
- `renderMode: 'overlay'` (Lions Share: positioned markers on a surface, sidebar list)

A single widget can ship both; the host picks the mode at mount.

## Extraction checklist (Lions Share side)

- [ ] Generalize `Pin` → `Annotation` with discriminated `anchor` union (route vs spatial).
- [ ] Lift severity rule out of `/tracks` into an injected `inferSeverity(annotation): 'low' | 'medium' | 'high'`.
- [ ] Shadow-state pattern for immutable seeded annotations (preserve in widget for the seed-data adapter case).
- [ ] Replace footer copy with parameterized `footerHint?` prop or remove from the widget shell.
- [ ] Make `headerMode: 'mac-chrome' | 'minimal' | 'none'` configurable for the overlay surface.
- [ ] Document the CSS custom property contract so host themes plug in cleanly.
- [ ] When v0.8 wires D1, do it through the same `ApiAdapter` Pivotal uses.
- [ ] Lions Share `/tracks` continues to consume via direct read of the widget's persistence store + injected severity rule.
