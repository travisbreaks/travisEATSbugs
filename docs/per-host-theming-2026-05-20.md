# TEB per-host theming: drawer + helper overlay

**Status:** open. Captured from Travis QA 2026-05-20 (TEB on Pivotal
context).
**Priority:** high. Affects every site TEB is installed on.
**Related:** `client-facing-tenancy.md` (Phase B / Phase 3 LS work)

## The issue

The TEB widget currently themes its **button** correctly per host site
(LS uses Mane orange, Pivotal uses red `#EC2127`, etc.) via the
`--teb-accent` / `--teb-bg` / `--teb-fg` CSS variables that
`eats-mount.tsx` sets on `document.documentElement`.

**The DRAWER + helper overlays do NOT inherit the host palette.** They
keep TEB's default cream/dark theme regardless of host. On Pivotal that
reads as visually disjoint: the red button + cream PAGE NOTES card
side-by-side don't look like one tool.

## What needs to change

In `packages/widget/src/drawer.ts`:

1. Audit every hardcoded color (currently 30+ uses; see `grep -n "color:\|#[0-9a-fA-F]\{3,6\}"`)
2. Convert each to a CSS custom property:
   - `--teb-surface-1` (current `#ffffff`) → keep, expose
   - `--teb-surface-2` (current `#f6f6f7`) → keep, expose
   - `--teb-fg` → already a var
   - `--teb-accent` → already a var
   - `--teb-muted` → already a var
   - Plus probably need: `--teb-surface-text-strong`, `--teb-surface-border`
3. Audit other modules: `bug-mode.ts`, `page-mode.ts`, `overlay.ts` for the
   same pattern
4. The mode-picker UI Travis screenshotted (PAGE NOTES header + Notes
   list + Sticky notes options) lives in one of those: find it; add
   var-driven theming

## Host-side adoption

Once vars exposed, each host's `eats-mount.tsx` sets the full palette:

```tsx
// Pivotal eats-mount:
document.documentElement.style.setProperty('--teb-accent', '#EC2127');
document.documentElement.style.setProperty('--teb-bg', '#FFFFFF');
document.documentElement.style.setProperty('--teb-fg', '#1a1a1a');
document.documentElement.style.setProperty('--teb-surface-1', '#FFFFFF');
document.documentElement.style.setProperty('--teb-surface-2', '#F8F4F4');
document.documentElement.style.setProperty('--teb-muted', '#737373');

// LS OS eats-mount:
document.documentElement.style.setProperty('--teb-accent', '#C04618');
document.documentElement.style.setProperty('--teb-bg', '#FFFFFF');
document.documentElement.style.setProperty('--teb-fg', '#1a1a1a');
document.documentElement.style.setProperty('--teb-surface-1', '#FFFFFF');
document.documentElement.style.setProperty('--teb-surface-2', '#FAF6EE');
document.documentElement.style.setProperty('--teb-muted', '#6C6A68');
```

## Effort estimate

- Drawer audit + var conversion: 2-3 hours
- Other module audit: 1 hour
- Per-host adoption (pivotal-platform + lions-share): 30 min each
- Build, vendor, test in both: 1 hour
- Ship as 0.0.8-alpha + commit

Total: ~5 hours focused work.

## Acceptance criteria

- TEB drawer on Pivotal reads visually consistent with Pivotal red brand
- TEB drawer on LS OS reads visually consistent with LSD Mane orange brand
- No host-specific code in `packages/widget/src/*`: pure CSS var driven
