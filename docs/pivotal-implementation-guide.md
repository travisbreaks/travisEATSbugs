# Pivotal implementation guide

How the Pivotal admin app (Cole's project) adopts `@travisbreaks/travisEATSbugs` in place of the bespoke `<PageNotesDrawer />` it shipped against Pivotal mig 043 + 045 + 058.

This guide is written for the engineer doing the cutover. It assumes familiarity with the existing page-notes drawer, the auth-stub conventions, and the D1 schema currently in place. It does **not** prescribe a timeline; the only constraint is that Cole sees no behavior change on flip day.

Source-of-truth references:
- `docs/extraction-strategy-2026-05-15.md` (why the widget exists, what got consolidated)
- `docs/pivotal-extraction-audit-2026-05-15.md` (full Pivotal-side mapping)
- `packages/widget/src/types.ts` (the unified `Annotation` shape)
- `apps/worker/README.md` (REST contract + deploy runbook)

---

## What you're swapping

| Pivotal today | After cutover |
|---|---|
| `<PageNotesDrawer />` React component, hand-written | `<AnnotationWidget renderMode="drawer" />` |
| Local Postgres `page_notes` table | Unchanged. Adapter reads/writes it. |
| `/api/page-notes` Next.js route handlers | Optional. Adapter can call them directly OR use the worker. |
| `wrapWithAudit` rolled in-line | Same hook, now via `WidgetOpts.onAudit` |
| Severity inferred client-side | Same hook, now via `theme.inferSeverity` |
| Drop-cap M sticky-note style | Same, via CSS custom properties on `:root` |

The widget owns no I/O. You bring the auth, the API, and the theme. The widget brings rendering + the discriminated `UpdatePatch` + the audit wrap + the triage hook + W3C export.

---

## Phase 1: install + wire the adapter (no UI change yet)

### 1a. Install

```bash
pnpm add @travisbreaks/travisEATSbugs @travisbreaks/travisEATSbugs-http
```

The HTTP adapter is the cheapest path: it speaks to whatever REST endpoint you already have for page notes. If you prefer to call Postgres directly (bypassing `/api/page-notes`), write a thin custom `ApiAdapter` instead; the contract is in `packages/widget/src/adapters.ts`.

### 1b. PivotalAdapter

The simplest viable adapter:

```ts
// pivotal/web/lib/pivotal-bugs-adapter.ts
import { HttpAdapter } from '@travisbreaks/travisEATSbugs-http'

export function createPivotalAdapter(authToken: string) {
  return new HttpAdapter({
    baseUrl: '/api/page-notes',     // your existing handler
    authorization: `Bearer ${authToken}`,
    // The HTTP adapter speaks the same shape as the worker:
    // GET / POST /annotations
    // PATCH /annotations/:id
    // DELETE /annotations/:id
    // GET /authors
  })
}
```

If `/api/page-notes` uses a different URL shape (e.g. `/api/projects/:id/page-notes`), either:
1. Rename the existing handler to match the widget's contract (preferred; one less translation layer), or
2. Write a custom `ApiAdapter` that translates between the two. The shape is exactly the same as the existing `PageNote` row: `Annotation` has been designed to be a strict superset (see `docs/pivotal-extraction-audit-2026-05-15.md` §3).

### 1c. AuthAdapter

Cole's auth-stub returns the current user. Wrap it:

```ts
import type { AuthAdapter, AuthorRef } from '@travisbreaks/travisEATSbugs'
import { getCurrentUser } from '@/lib/auth-stub'

export const pivotalAuth: AuthAdapter = {
  async getCurrentUser(): Promise<AuthorRef | null> {
    const u = await getCurrentUser()
    return u ? { id: u.id, display: u.name, avatarUrl: u.avatarUrl } : null
  },
  canAdmin(user) {
    return user.id === 'cole' || user.role === 'admin'
  },
}
```

### 1d. ThemeAdapter

Cole's sticky-note styling lives at `:root`. Pass it through unchanged: the widget reads CSS custom properties through the shadow DOM, so existing `--page-notes-*` vars don't need to be touched.

If you want widget-specific overrides:

```ts
export const pivotalTheme: ThemeAdapter = {
  buttonLabel: 'Page notes',
  drawerTitle: 'Notes on this page',
  emptyStateCopy: 'No notes yet. Drop one to start a thread.',
  prUrlTemplate: (n) => `https://github.com/travisbreaks/pivotal/pull/${n}`,
  // Preserve the existing Pivotal heuristic for inbox severity inference.
  inferSeverity: (a) => {
    if (a.body.length > 240) return 'high'
    if (/urgent|broken|crash|blocker/i.test(a.body)) return 'high'
    if (a.body.length < 30) return 'low'
    return 'medium'
  },
}
```

---

## Phase 2: swap `<PageNotesDrawer />` for `<AnnotationWidget />`

Currently:

```tsx
// pivotal/web/components/layout/app-shell.tsx
import { PageNotesDrawer } from '@/components/page-notes/page-notes-drawer'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageNotesDrawer />
    </>
  )
}
```

After cutover:

```tsx
'use client'
import { AnnotationWidget } from '@travisbreaks/travisEATSbugs'
import { useEffect } from 'react'
import { createPivotalAdapter } from '@/lib/pivotal-bugs-adapter'
import { pivotalAuth, pivotalTheme } from '@/lib/pivotal-widget-config'

export function PageNotesMount({ authToken }: { authToken: string }) {
  useEffect(() => {
    const widget = new AnnotationWidget({
      api: createPivotalAdapter(authToken),
      auth: pivotalAuth,
      theme: pivotalTheme,
      renderMode: 'drawer',
      position: { bottom: 24, right: 24 },
      onAudit: (e) => {
        // Wire to your existing audit log. The widget already enforces
        // single-shape PATCH discrimination; this hook just fires on
        // every successful mutation for analytics / realtime broadcast.
        fetch('/api/audit', { method: 'POST', body: JSON.stringify(e) })
      },
    })
    widget.mount()
    return () => widget.destroy()
  }, [authToken])
  return null
}
```

`<AnnotationWidget />` constructs its own shadow DOM host, so it doesn't fight with your CSS. The `position` prop puts the floating button in the same spot the current drawer trigger sits.

The widget reads the route from `window.location.pathname` automatically when annotations are created. Existing rows keyed on `page_path` continue to work because the adapter passes the same string through.

---

## Phase 3: feature parity verification

Before flipping prod, run through the inherited primitives in a preview deploy. The widget has feature parity with the current drawer for every one of these:

| Feature | Source in the widget | Pivotal counterpart |
|---|---|---|
| Resolution + reopen | `UpdatePatch` `{ resolvedPR: number }` / `{ resolvedPR: null }` | mig 045 resolution columns |
| Overlap (relatedIds, dupOf) | `UpdatePatch` `{ relatedIds, dupOf }` | mig 058 overlap columns |
| Audit log | `onAudit` callback + adapter `annotation_audit_log` table | rolled into route handler today |
| Triple-selector anchoring | `selector` + `xpath` + `textQuote` + `viewport` on the anchor | new in widget; route-mode adapter populates them |
| Click-to-mark mode | The v0 floating button (`bug-mode.ts`) | the inbox toggle |
| Reporter mode (anon share link) | `localStorageReporter` + worker share-token | new capability |
| AI triage (v0.5) | `wrapWithTriage` + worker `/triage` route | new capability |
| Drag-to-reposition (v0.5) | Spatial mode only; route pins stay anchored to selectors | n/a (Pivotal is route-only today) |
| W3C export | `toW3C` / `fromW3C` | new capability (interop with hypothes.is / Recogito / Pundit) |

Smoke checklist (21 / 21 was the existing baseline):

- [ ] Drawer opens from the floating button
- [ ] Compose adds a note; appears in the list immediately
- [ ] Edit body updates in place
- [ ] Resolve (with PR number) flips state to `resolved`
- [ ] Reopen clears all four resolution columns
- [ ] Mark duplicate of another note sets `dupOf`
- [ ] Delete removes the row
- [ ] Audit log captures all five mutations
- [ ] Severity badges render per `theme.inferSeverity`
- [ ] PR link template points at the right repo
- [ ] CSS custom properties pierce the shadow DOM correctly
- [ ] Mobile (<= 640px) drawer drops to bottom sheet
- [ ] Empty state copy matches `theme.emptyStateCopy`
- [ ] Resolver attribution shows the right author display name
- [ ] CMD-Enter saves the compose textarea
- [ ] Escape cancels compose without saving
- [ ] Filter chips (open / resolved / all) work
- [ ] `auth.canAdmin` gates the delete affordance
- [ ] Reduced-motion preference disables animations
- [ ] Triple-selector anchor (CSS + XPath + text-quote) survives a class-name churn
- [ ] No console errors during a full session

---

## Phase 4: enable v0.5 (optional, after parity ships)

The cutover above gets you to feature parity. v0.5 is opt-in on top.

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

The worker needs `ANTHROPIC_API_KEY` set (see `apps/worker/README.md`). With it, every `create` triggers a Claude pass and writes back `Annotation.triage` with `{ severity, category, suggestedAssignee?, dupeOf?, rationale }`. Failures + null returns are non-fatal: the annotation lands either way.

### Screenshot capture

```ts
import { defaultScreenshotCapture } from '@travisbreaks/travisEATSbugs'

const widget = new AnnotationWidget({
  // ... existing config
  screenshotCapture: defaultScreenshotCapture, // demo-grade data URL
})
```

For production, write a `ScreenshotCaptureFn` that uploads to R2 and returns the public URL. The widget threads it through `CreateInput.screenshot`.

### W3C export

```ts
import { toW3C } from '@travisbreaks/travisEATSbugs'

// In your admin export route:
const all = await api.list({ state: 'all' })
const doc = {
  '@context': 'http://www.w3.org/ns/anno.jsonld',
  type: 'AnnotationCollection',
  total: all.length,
  items: all.map(toW3C),
}
```

This is a spec-valid JSON-LD document that federation consumers (hypothes.is, Recogito, Pundit) can ingest. Round-trips back through `fromW3C` losslessly.

---

## Migration of existing rows

The widget's `Annotation` type is a structural superset of the current Pivotal `PageNote` row. Existing rows need **no data migration**; the adapter reads them as-is.

The only new columns are v0.5-specific: `anchor_xpath`, `screenshot_url/w/h`, `triage_*` (6 columns). These all default to NULL. The widget reads NULL as "absent" and behaves identically to the pre-cutover drawer.

If you do want to backfill the XPath column for existing rows, run the route-anchor capture logic against each row's URL in a background job. The selector + text-quote columns already cover the same redundancy bands; XPath is purely additive.

---

## Rollback plan

If something goes sideways post-cutover:

1. **Soft rollback** (5 minutes): revert the `<PageNotesDrawer />` component swap (Phase 2). The widget is uninstalled, the existing drawer is back. The D1 / Postgres rows are unchanged.
2. **Hard rollback** (15 minutes): if the new v0.5 columns conflict with anything, run `ALTER TABLE page_notes DROP COLUMN anchor_xpath` etc. The widget tolerates their absence, so this only matters if your downstream queries assume they exist.

Don't roll back by editing the applied migration; create a new migration that drops the columns.

---

## Open questions

These are not blockers, but flag them with Bibble / Lion's Share before the flip:

- Do you want to keep `/api/page-notes` as the live endpoint, or move to the worker at `eats.travisfixes.com`? Both work. The HTTP adapter doesn't care.
- Should the AI triage `onCreate` hook be on for all reporters, or member-only? Currently the worker route is member-only (cost gate); the widget wrap is per-host config.
- Are there Pivotal-specific motivations (e.g. `tagging`, `linking`) that should map to W3C beyond our default `commenting`? The widget defaults to `commenting` (or `[commenting, assessing]` for high-severity); extend `toW3C` if you need others.
