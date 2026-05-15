# Pivotal page-notes extraction audit

Date: 2026-05-15
Audited tree: `/Users/travisbonnet/code/CODE/pivotal-replacement/`
Purpose: catalog Pivotal's page-notes evolution so we can extract its irreducible primitives into `@travisbreaks/travisEATSbugs` and consume them back through an adapter.

---

## 1. Live API surface

File: `app-cf/src/app/api/page-notes/route.ts` (446 lines)

Auth: `getCurrentUser()` required on every endpoint (401 if absent). Resolution / overlap mutations gated to `admin` and `builder` roles.

Endpoint shapes:
- `GET ?path={normalized_path}` → `{ ok, path, notes: Note[] }` (scoped to current user, no-cache).
- `POST { path, body }` → `{ ok, id, path }` (body ≤ 5000 chars; path normalized: strips `?` + `#`, requires leading `/`, ≤ 500 chars; audit `page_note_create`).
- `PATCH` four discriminated shapes:
  1. Body edit `{ id, body }` (author or builder; audit `page_note_edit`).
  2. Resolution write `{ id, resolved_pr, resolution_note?, related_note_ids?, dup_of_note_id? }` (stamps `resolved_pr`, `resolved_at = unixepoch()`, `resolved_by`; audit `page_note_resolve`).
  3. Reopen `{ id, resolved_pr: null }` (clears all 4 resolution columns; audit `page_note_reopen`).
  4. Overlap-only mark `{ id, related_note_ids?, dup_of_note_id? }` (no resolution commitment; audit `page_note_overlap_mark`).
- `DELETE ?id={id}` → `{ ok, id }` (author or builder; audit `page_note_delete`).

Validation: `related_note_ids` is JSON array of positive ints, self-reference rejected, defaults null; `dup_of_note_id` validates parent exists; `resolution_note` ≤ 500 chars; body + resolution/overlap cannot be combined in a single PATCH.

Dependencies: `@/lib/auth-stub`, `@/lib/db`, `@/lib/audit`, migration 043 + 045 + 058 schema.

## 2. Drawer component

File: `app-cf/src/components/page-notes-drawer.tsx` (416 lines, `'use client'`)

UX flows: open/close with overlay backdrop, abortable load on path change, textarea compose with `Cmd/Ctrl+Enter`, inline edit (`Cmd/Ctrl+Enter` save, `Esc` cancel), confirm-dialog delete, read-only resolution badges (`Resolved · PR #X` green, `Marked duplicate of #N` red).

Data shape (mirrors `Note` row): `id, page_path, author_id, body, created_at, modified_at, resolved_pr?, resolved_at?, resolved_by?, resolution_note?, related_note_ids?, dup_of_note_id?`.

Styling: CSS custom properties `--surface-1`, `--surface-2`, `--fg`, `--border`, `--muted`, `--accent`. Fixed bottom-right at `right-20` to clear the AI chat at `right-5`. Drawer is `sm:w-[420px]`, slides in from right.

Hardcoded to Pivotal: button position assumes adjacent AI chat, icon SVG, drawer copy, accent color tokens, auth always assumed.

## 3. Admin inbox

Files:
- `app-cf/src/app/admin/page-notes-inbox/page.tsx` (306 lines)
- `app-cf/src/app/admin/page-notes-inbox/page-notes-inbox-table.tsx` (450 lines)

Surface: cross-page cross-user list, role-gated (admin/builder only; agent → redirect to `/`). Tabs Open / Resolved / All with counts. Author-filter dropdown populated from `getAllUsers()`. Open sort `created_at DESC`, Resolved sort `resolved_at DESC`.

Per-row resolution workflow: PR # (required), resolution note (optional ≤ 500 chars), optional comma-separated `related_note_ids`, optional `dup_of_note_id`. Single PATCH with all fields. Optimistic flip with rollback on error.

Overlap surfacing: red duplicate-of badge with parent PR if resolved; muted related-note badges; amber heuristic hint when a recently-resolved note exists within 14 days for same path+author.

No bulk actions; filtering is the bulk mechanism.

## 4. Migration trajectory

`app-cf/migrations/043_page_notes.sql` (22 lines): base table `id, page_path, author_id, body, created_at, modified_at`. Indexes `(page_path, author_id, created_at DESC)` and `(author_id, modified_at DESC)`.

`app-cf/migrations/045_page_notes_resolution.sql` (24 lines): `+resolved_pr, +resolved_at, +resolved_by, +resolution_note`. Index `(resolved_at, resolved_pr)`. Backfill via `docs/seed-page-notes-resolution.sql`.

`app-cf/migrations/058_page_notes_overlap.sql` (30 lines): `+related_note_ids (TEXT JSON), +dup_of_note_id (INTEGER REFERENCES page_notes(id))`. Index `(dup_of_note_id)`.

`app-cf/migrations/058_page_notes_overlap_backfill.sql` (12 lines): idempotent seed of one known overlap (note #35 → `[26]`).

## 5. Branch deltas

`feat-page-notes-v0` (remote): single commit `94fb674`. Migration 043, route.ts 187 lines, drawer.tsx 368 lines. Bare v0.

`feat-page-notes-inbox` (local + remote): 4 page-note commits. Adds migration 045, inbox page + table, refocus fix, race-condition fix. route.ts 321 lines, drawer.tsx 376 lines.

`feat-page-notes-overlap-tracking` (local + remote, currently checked out): 5 commits total. Adds migration 058 + backfill, overlap PATCH shape, dup-of + related badges in drawer, heuristic overlap detection in inbox. route.ts 446 lines, drawer.tsx 416 lines, inbox page 306 + table 450 lines.

`fix-page-notes-race-condition` (remote): isolated bug fix. Clear textarea optimistically on submit-click (not after await) so in-flight #1 response doesn't wipe in-progress #2 text. Merged into inbox branch.

`fix-page-notes-refocus` (remote): isolated bug fix. `setTimeout(() => composeRef.current?.focus(), 0)` after save so consecutive notes work. Merged into inbox branch.

## 6. Resolution seed

`docs/seed-page-notes-resolution.sql` (44 lines): backfills migration 045 so the admin inbox doesn't start empty. Maps 7 notes to PR numbers, 1 to `resolved_pr = 0` (no-action sentinel), rest left open. Executed via wrangler D1, skips audit log intentionally.

## 7. Worktree

`/Users/travisbonnet/code/CODE/pivotal-notes-overlap/` is a clean worktree on `feat-page-notes-overlap-tracking` at `838263e`. No in-flight modifications.

## 8. Mount point

`app-cf/src/components/app-shell.tsx` mounts `<PageNotesDrawer />` directly. Drawer reads `usePathname()` and calls `/api/page-notes` itself. No props injected. `NO_SHELL_PATHS = ['/login']` is the only exclusion.

To make it generic:
1. Inject API adapter prop instead of hardcoded `/api/page-notes`.
2. Theme via injected token object (or keep CSS custom properties but document required vars).
3. Make button position + icon + copy configurable.
4. Inject `getCurrentUser` instead of importing auth-stub.
5. Lift path normalization to adapter or config.

## 9. Auth coupling

Direct dependencies:
- `route.ts`: `getCurrentUser()` on every endpoint; role check `me.role !== 'admin' && me.role !== 'builder'` gates resolution / overlap writes; builder can override others' edits.
- `inbox/page.tsx`: `getCurrentUserOrThrow()` + role gate + `getAllUsers()` for author filter.
- `drawer.tsx`: no direct auth; renders unconditionally; backend returns 401 if user logged out.

Baked assumptions: user identity scoped to `me.id`; admin/builder/agent role taxonomy; flat enumerable user list for the inbox dropdown; auth lifecycle equals session lifecycle.

Decoupling shape:
```ts
type WidgetAuth = {
  getCurrentUser: () => Promise<{ id: string; display: string; role?: string } | null>;
  canAdmin?: (user) => boolean;
  listUsers?: () => Promise<{ id: string; display: string }[]>;
};
```

## 10. The irreducible primitive

Generic core that ships in `@travisbreaks/travisEATSbugs`:

- **Data model**: `id, anchor (path / selector / textQuote / viewport), body, author, createdAt, modifiedAt, state (open/resolved), resolvedPR?, resolvedAt?, resolvedBy?, resolutionNote?, relatedIds?, dupOf?, severity?, screenshot?`
- **Drawer surface**: floating button + drawer with tabs/list, compose, edit, delete, resolution badge display
- **Triage inbox surface** (separate component): cross-page list, filter by author / state, per-row resolve action, overlap mark, heuristic overlap hint
- **API contract** (REST, adapter-bound):
  - `GET /notes?path=` → list
  - `POST /notes {path, body}` → create
  - `PATCH /notes {id, ...}` → discriminated edit/resolve/reopen/overlap
  - `DELETE /notes?id=` → delete
- **Audit hook** (optional): every mutation can fire `onAudit({action, id, user, fields})` to the host app

Pivotal-specific (stays in pivotal-replacement, consumed via adapter):
- Auth-stub (`getCurrentUser`, role taxonomy admin/builder/agent)
- D1 binding + SQL prepared statements
- CSS custom property theme (Pivotal red / red signal)
- Button position `right-20` (because Pivotal also runs AI chat at `right-5`)
- PR-URL generator `github.com/travisbreaks/pivotal-platform/pull/{n}`
- Cole-specific UX polish (refocus, race-condition optimistic clear)
- Placeholder copy "Leave a note about this page..."
- Icon design

## Extraction checklist

- [ ] Copy migrations 043 + 045 + 058 + 058_backfill into `travisEATSbugs/packages/adapter-cloudflare/migrations/` (rename + namespace per the package).
- [ ] Extract drawer + admin inbox into `packages/widget/` with adapter / theme / auth props.
- [ ] Define `ApiAdapter` contract (`getNotes`, `createNote`, `updateNote`, `deleteNote`, `listUsers?`).
- [ ] Define `AuthAdapter` contract (`getCurrentUser`, `canAdmin?`).
- [ ] Extract CSS custom properties to a documented theme contract; ship sensible defaults.
- [ ] Configurable button position, icon, copy, drawer placement.
- [ ] Build a `pivotal-adapter` thin wrapper in pivotal-replacement that satisfies the contracts using existing auth-stub + D1 bindings.
- [ ] Migrate Pivotal's mount from direct drawer import to widget import + adapter wiring.
- [ ] Verify Pivotal still ships 21/21 smoke green after the swap.
