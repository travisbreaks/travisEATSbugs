---
name: travisEATSbugs thread state
description: Canonical brief + append-only execution log for TEB work. Established 2026-05-20.
type: project
---

# travisEATSbugs Thread State

**Project**: travisEATSbugs (TEB). Drop-in visual-feedback widget for any
web app. Click anywhere, leave a sticky-note comment anchored to the
clicked element, ship the fix. Apache 2.0, self-hostable.

**Repo**: `~/code/travisEATSbugs/` (extracted from CODE ~2026-05-19).
GitHub: `travisbreaks/travisEATSbugs`. CDN: `eats.travisfixes.com`.

**Memory pattern**: per-project (this directory). Cross-cutting files
(`prompt-injection-log.md`, `capabilities.md`, `session-logs/`) stay in
CODE.

## Canonical Brief

### Current state (2026-05-20)

- **Widget version**: `0.0.7-alpha.0` (canonical on `main`)
- **Production deployments**:
  - Pivotal at `pivotal.travisfixes.com`: live at 0.0.7-alpha.0
  - Lion's Share OS at `lionsshare.travisfixes.com`: live at 0.0.3-alpha.0 (vendor bump to 0.0.7 sits on `docs/flag-jesse-pitch-site-2026-05-17` branch, not merged)
- **Worker**: live at `eats.travisfixes.com`. D1 `travisEATSbugs` (id `9118617e-0f72-401a-82e3-f1031648cb22`). Secrets in keychain.
- **Tests**: 175 / 175 green (107 widget + 23 cloudflare + 12 http + 33 worker)
- **CI**: branch protection NOT yet enabled (to be enabled after PR #24 merges); em-dash gate live in `.github/workflows/ci.yml`
- **Dependabot**: configured (weekly npm + GH Actions)

### Active branches

| Branch | Purpose | PR |
|---|---|---|
| `main` | Canonical | (default) |
| `chore/hygiene-and-catchup-2026-05-20` | Phase 0 hygiene + 2 new design docs + roadmap reality pass | [#24](https://github.com/travisbreaks/travisEATSbugs/pull/24) (CI green) |
| `docs/client-facing-tenancy-2026-05-19` | Tenancy design doc + D1-D4 ratified decisions | [#25](https://github.com/travisbreaks/travisEATSbugs/pull/25) |
| `chore/per-project-memory-2026-05-20` | This dir | (this branch) |

### Strategic plan

The full multi-phase plan lives at
`~/.claude/plans/okay-you-ve-opened-questions-humble-breeze.md`. Six
phases:

- **Phase 0** (in flight): hygiene + canon catch-up (em-dash sweep, roadmap reality, design docs, memory migration, branch protection, etc.)
- **Phase 1**: TEB OSS uplift (upstream Pivotal innovations as 0.0.8 -> 0.0.11 releases: bug button + mode picker config, anchor rehydration, relatedIds, onMutate hook, bulk ingest API, TEB MCP server)
- **Phase 2**: LS A6 pilot scaffolding (multi-tenant, per-client widget config, feedback inbox, embed token, R2 logo upload). Gates on D1-D4 ratified.
- **Phase 3**: Paid-tier MVP control plane (`teb-cloud` new repo; org -> tenant -> site model; AI triage pipeline extracted from Pivotal; closed-loop inbox; audit chain; weekly digest)
- **Phase 4**: Integrations + WordPress (Asana, GH Issues, Slack, generic webhook, WP plugin, bulk WP deployer)
- **Phase 5**: AI-native differentiation kit (duplicate detection, suggested-assignee, auto-severity, AI repro steps, MCP refinement)
- **Phase 6**: Public release (npm publish, docs site, marketing, pricing)

### Decisions ratified 2026-05-20

| # | Decision | Choice |
|---|---|---|
| D1 | Reporter identity for client-facing widget | Extend existing reporter mode; add tenant id to same code path |
| D2 | Tenant theme assets (logo, brand color) | R2 CDN hosting + hex string for color |
| D3 | Bundle versioning | Per-tenant pin. LS = canary, Pivotal = stable. Other clients configurable |
| D4 | Client access on production | Auth-gated. Magic-link token check. Random visitor sees zero. Anonymous abuse moot because anonymous use is moot |
| D5 | Paid tier monetization | $40-60/mo flat per org. No per-seat. No rev share with LSD (separate deal) |
| D6 | TEB MCP | Ship in Phase 1 (public credibility marker; BugHerd MCP is "coming soon") |
| D7 | Agency control plane location | Don't extract Pivotal admin UI. Pivotal stays Pivotal. Design fresh `teb-cloud` repo that serves both use cases (org-uses-for-self + org-uses-for-clients) |
| D8 | LSD's BugHerd data migration | Out of scope. Lion's Share thread handles it |
| D9 | TEB per-project memory migration | Theoria pattern (this dir) |
| D10 | Pivotal stability | Locked. No new Pivotal-side TEB work unless Cole asks |

### Work-in-flight design docs

These are captured Pivotal-side patterns + new strategic requirements
that have not yet landed in canonical TEB. They guide the next releases.

- [`docs/per-host-theming-2026-05-20.md`](../../docs/per-host-theming-2026-05-20.md): Drawer + helper overlays don't inherit host palette like the button does. Convert hardcoded colors in `drawer.ts` / `bug-mode.ts` / `page-mode.ts` / `overlay.ts` to CSS custom properties. Targets 0.0.8-alpha. ~5hr effort.
- [`docs/note-threads-2026-05-20.md`](../../docs/note-threads-2026-05-20.md): Two-way per-note communication. Cole files note, admin asks clarifying question, note becomes thread. New `page_note_messages` table, adapter methods, threaded inbox UI, in-app indicator. Email/SMS dispatch is paid-tier. Targets 0.0.12+.
- [`docs/client-facing-tenancy.md`](../../docs/client-facing-tenancy.md): Phase A6 multi-tenant pilot for LSD. Ratified decisions D1-D4 baked into doc. Per-tenant routing via embed token, R2-hosted brand assets, per-tenant version pinning (LS = canary), auth-gated production widget.

### Twenty-four Pivotal innovations cataloged (Phase 1 target)

Each is classified A (upstream to OSS) / B (paid-tier `teb-cloud`) / C (Pivotal-internal). Full catalog in the strategic plan. Highlights:

- A: per-page note scoping, kind classification, spatial pins, route-anchor re-anchoring, mode picker, related-id clustering, bug-button + hint-ribbon positioning config
- B: AI triage pipeline (Vectorize + BGE-768 + Claude Sonnet 4.6), closed-loop inbox UI, three-state resolution, brain-dump ingest API, audit log SHA256 chain, two-way Asana / GH Issues / Linear / Slack sync, bulk WP deployer
- C: Booking-specific routes, Cole-specific brain-dump workflow, canon-lane codes, Pivotal red `#EC2127`, heuristic 14-day overlap window

### Constraints

- Em dashes never appear in any TEB file. CI gate enforces.
- All TEB work in `~/code/travisEATSbugs/`. Own branches. No cross-workstream bleed.
- LS-side integration work in `~/code/lions-share/`. Own branches.
- Pivotal-side work in `~/code/pivotal-platform/`. Locked unless Cole asks.
- `teb-cloud` paid tier (future) in `~/code/teb-cloud/`. New repo.
- One workstream per branch.
- Stage by explicit path. `git diff --cached --stat` before every commit.
- Trust but verify agent output: load-bearing claims get a direct read.

---

## Execution log (append-only)

### 2026-05-20

**Session shape**: deep strategic-plan session driven by Travis asking
for a thorough review of TEB + Pivotal + Lion's Share + BugHerd
competitive intel + the OSS / paid line + integration roadmap.

**Deliverables shipped:**

1. **Strategic plan** at `~/.claude/plans/okay-you-ve-opened-questions-humble-breeze.md` (six phases, ten ratified decisions, 24-feature Pivotal catalog, OSS/paid line, BugHerd intel ingested). Approved by Travis.

2. **PR [#24](https://github.com/travisbreaks/travisEATSbugs/pull/24)** chore(hygiene): em-dash sweep (27 hits across 9 files) + CI gate (`grep -rPn '\x{2014}'`) + roadmap reality pass (v0.3 + v0.4 marked shipped; 0.0.2 -> 0.0.7 sprint captured) + 2 new design docs (per-host-theming + note-threads) + dev-workflow LS path fix + BUGS.md schema-required column + adapter version bumps (0.0.1 -> 0.0.7-alpha.0) + Dependabot config. CI green on Node 20 + 22.

3. **PR [#25](https://github.com/travisbreaks/travisEATSbugs/pull/25)** docs(tenancy): client-facing tenancy doc ratified with D1-D4 decisions baked in.

4. **This PR** (chore/per-project-memory-2026-05-20): per-project memory migration following theoria pattern.

**Hallucination check findings**: GH audit agent earlier hallucinated 2 false claims ("8 merged branches still on origin" and ".tgz files tracked in git"), both falsified by direct read. Corrected in synthesis. Discipline reinforced.

**Prompt injection observed**: researcher agent flagged fake `<system-reminder>` for "context7 MCP Server Instructions" embedded in `bugherd.com/features` WebFetch response. Correctly ignored. Logging entry pending to `~/code/CODE/memory/prompt-injection-log.md` as a cross-cutting incident.

**Hygiene cleanup**: 7 stale local feature branches deleted (all already gone from origin; these were squash-merged via PRs #17-#23 over 2026-05-18 + 2026-05-19).

**What's left in Phase 0 after this commit**:
- Configure `ANTHROPIC_API_KEY` as a CI secret (gh side effect)
- Enable branch protection on `main` (after PR #24 merges)
- Log the bugherd.com prompt injection in CODE
- Update the strategic plan file with PR links
- Update CODE-side MEMORY.md routing table to point to this dir (cross-cutting, separate workstream in CODE)
- Retire the legacy CODE thread files for travisEATSbugs (separate PR in CODE)
