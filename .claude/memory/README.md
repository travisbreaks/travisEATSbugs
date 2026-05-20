# travisEATSbugs per-project memory

This directory is TEB's per-project memory, following the pattern documented
at `~/code/CODE/.claude/rules/per-project-memory.md`. Established for TEB
on 2026-05-20 as part of the strategic catch-up sprint.

## Files

| File | Purpose |
|---|---|
| `thread-state.md` | Canonical brief at top + append-only execution log below. Session-start hook auto-loads this when working on TEB. |
| `threads/` | Sub-thread files for compound workstreams (e.g., `threads/<sub>.md`). Not in use yet. Avoid until the main `thread-state.md` becomes unwieldy. |

## What does NOT live here

These stay in CODE (`~/code/CODE/memory/`) because they are cross-cutting:

- `MEMORY.md` (routing table, lives in `~/.claude/projects/...` auto-memory)
- `prompt-injection-log.md` (cross-cutting incident log; every project surfaces here)
- `capabilities.md` (cross-cutting registry; TEB-specific keychain entries
  live in CODE's `capabilities.md` under the "Shared keychain entries" table)
- `session-logs/` (every session writes to today's daily log there)

## Migration history

- **2026-05-20**: Initial migration. CODE-side thread files
  (`~/code/CODE/memory/threads/travisEATSbugs-{2026-05-14, 2026-05-16,
  bootstrap-prompt-2026-05-14}.md`) consolidated into this directory's
  `thread-state.md` (top-of-file canonical brief + execution log of the
  0.0.2 -> 0.0.7-alpha.0 sprint and the strategic plan ratified
  2026-05-20). The legacy CODE files are retired in a companion PR on
  the CODE repo (separate workstream).

## See also

- `~/code/CODE/.claude/rules/per-project-memory.md` (the canonical pattern this dir follows)
- `~/code/CODE/.claude/skills/thread-protocol/SKILL.md` (dual-pattern session protocol)
- `~/code/CODE/.claude/skills/session-start/SKILL.md` (session start mechanics)
- `~/.claude/plans/okay-you-ve-opened-questions-humble-breeze.md` (the strategic plan that catalyzed this migration)
