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

### Current state (2026-05-20 late, post-colleague-send polish)

- **Widget version**: `0.0.10-alpha.0` (canonical on `main` across widget + adapter-cloudflare + adapter-http + mcp-server after PR #38 aligned them)
- **Release**: [v0.0.10-alpha.0](https://github.com/travisbreaks/travisEATSbugs/releases/tag/v0.0.10-alpha.0) tagged + GitHub Release published (prerelease flag). First tagged release on the repo.
- **Production deployments**:
  - Pivotal at `pivotal.travisfixes.com`: live at 0.0.7-alpha.0 (locked per D10; Cole's workflow not interrupted)
  - Lion's Share OS at `lionsshare.travisfixes.com`: live at 0.0.3-alpha.0 (Phase 2 will bump)
- **Worker**: live at `eats.travisfixes.com`. D1 `travisEATSbugs` (id `9118617e-0f72-401a-82e3-f1031648cb22`). Endpoints: `/annotations`, `/annotations/bulk` (member-token only, MAX_BULK_ITEMS=200), `/authors`, `/triage`. **Note:** does NOT serve a static `/v1.js` widget bundle; that's a v1.0 deliverable. README + docs/install.md + docs/architecture.md updated 2026-05-20 to stop promising the broken URL.
- **MCP server**: `apps/mcp-server/` at `@travisbreaks/travisEATSbugs-mcp` 0.0.10-alpha.0. 4 tools (list_annotations, get_annotation, resolve_annotation, reopen_annotation). `claude mcp add teb npx @travisbreaks/travisEATSbugs-mcp`.
- **Tests**: 207 green across 5 workspaces (120 widget + 23 cloudflare + 12 http + 40 worker + 12 mcp-server)
- **CI**: branch protection ENABLED on `main` (required: build node 20 + node 22). Em-dash gate live + enforced. Strict mode. GH Actions baseline updated to checkout@v6 / setup-node@v6 / pnpm-action-setup@v6 / upload-artifact@v7 after dependabot merge train.
- **Community**: CODE_OF_CONDUCT.md (Contributor Covenant 2.1) live since PR #39. Reporting channel `security@travisfixes.com` (same as SECURITY.md).
- **Dependabot**: ungrouped after PR #39 (group rule removed; per-package PRs going forward).
- **Issues**: 6 open, all genuinely pending: #10 admin dashboard, #12/#13/#14 two-way sync, #15 v1.0 npm release, #45 tracking issue for major dep migrations (next 16, vitest 4, happy-dom 20, wrangler 4, better-sqlite3 12)
- **PRs**: 0 open

### Active branches

| Branch | Purpose | Status |
|---|---|---|
| `main` | Canonical | HEAD post-PR#46 (README + docs install snippet fix) |

All sprint + polish branches MERGED + deleted. Local repo clean on `main`.

### Strategic plan

The full multi-phase plan lives at
`~/.claude/plans/okay-you-ve-opened-questions-humble-breeze.md`. Six
phases:

- **Phase 0**: COMPLETE 2026-05-20. PRs #24 + #25 + #26 merged. Em-dash sweep, CI gate, roadmap reality pass, 2 new design docs (per-host-theming + note-threads), per-project memory dir, branch protection, ANTHROPIC_API_KEY CI secret, dependabot.
- **Phase 1**: COMPLETE 2026-05-20. PRs #33 + #34 + #35 + #36 merged. 0.0.8 bug-button + hint-ribbon config, region-screenshot design doc + Pivotal-reframe, 0.0.9 bulk ingest endpoint, 0.0.10 TEB MCP server. Original plan had 0.0.11 = MCP; collapsed forward to 0.0.10 since 0.0.9's `onMutate` proved redundant with existing `wrapWithAudit`.
- **Phase 2** (NEXT): LS A6 pilot scaffolding (multi-tenant, per-client widget config, feedback inbox, embed token, R2 logo upload). Gates on Jesse picking a pilot client.
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

- [`docs/per-host-theming-2026-05-20.md`](../../docs/per-host-theming-2026-05-20.md): Drawer + helper overlays don't inherit host palette like the button does. Convert hardcoded colors in `drawer.ts` / `bug-mode.ts` / `page-mode.ts` / `overlay.ts` to CSS custom properties. NOT YET SHIPPED. Targets 0.0.11 or 0.0.12 (was 0.0.8 originally; 0.0.8 became bug-button config). ~5hr effort.
- [`docs/note-threads-2026-05-20.md`](../../docs/note-threads-2026-05-20.md): Two-way per-note communication. Cole files note, admin asks clarifying question, note becomes thread. New `page_note_messages` table, adapter methods, threaded inbox UI, in-app indicator. Email/SMS dispatch is paid-tier. Targets 0.0.12+.
- [`docs/region-screenshot-2026-05-20.md`](../../docs/region-screenshot-2026-05-20.md): Apple-Shift-4-style region selector inside the widget compose card. Priority medium per the Pivotal #106-#109 reframe (the pin already does its job; clarification is a process failure, not a tool gap). Targets 0.0.13.
- [`docs/client-facing-tenancy.md`](../../docs/client-facing-tenancy.md): Phase A6 multi-tenant pilot for LSD. Ratified decisions D1-D4 baked into doc. Per-tenant routing via embed token, R2-hosted brand assets, per-tenant version pinning (LS = canary), auth-gated production widget. Gates Phase 2.

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

### 2026-05-20 EOD (Phase 0 + Phase 1 wrap-up)

**Phase 0 completed:**
- PR [#24](https://github.com/travisbreaks/travisEATSbugs/pull/24) chore(hygiene): MERGED. Em-dash sweep + CI gate + roadmap reality + 2 design docs + dependabot config + adapter version bumps.
- PR [#25](https://github.com/travisbreaks/travisEATSbugs/pull/25) docs(tenancy): MERGED. D1-D4 ratified decisions baked into the tenancy doc.
- PR [#26](https://github.com/travisbreaks/travisEATSbugs/pull/26) chore(memory): MERGED. Per-project memory dir (theoria pattern).
- Branch protection: ENABLED on `main` (required CI checks for `build (node 20)` + `build (node 22)`, strict mode, no force-push, no deletion).
- ANTHROPIC_API_KEY: configured as CI secret (sourced from THEORIA_ANTHROPIC_API_KEY in keychain via `security find-generic-password | gh secret set`).
- 7 stale local feature branches deleted (origin counterparts already gone post-squash-merge).
- CODE-side MEMORY.md routing table: UPDATED with TEB row pointing to this dir.
- Prompt-injection log: incident 122 appended (bugherd.com/features WebFetch hit during BugHerd competitive research).

**Phase 1 completed (TEB OSS uplift):**
- PR [#34](https://github.com/travisbreaks/travisEATSbugs/pull/34) feat(widget) 0.0.8: MERGED. Bug-button + hint-ribbon config. Upstreams 4 Pivotal shadow-DOM workarounds (offset, size, animation modes, hintRibbon offset).
- PR [#33](https://github.com/travisbreaks/travisEATSbugs/pull/33) docs(screenshot): MERGED. Region-screenshot design doc + same-day Pivotal #106-#109 reframe (priority downgraded; the "look at source data before clarifying" insight baked into the AI-triage section).
- PR [#35](https://github.com/travisbreaks/travisEATSbugs/pull/35) feat(worker) 0.0.9: MERGED. `POST /annotations/bulk` endpoint. Member-token only, MAX_BULK_ITEMS=200, per-item error isolation. Brain-dump ingest path is now a public API.
- PR [#36](https://github.com/travisbreaks/travisEATSbugs/pull/36) feat(mcp) 0.0.10: MERGED. TEB MCP server (`apps/mcp-server/`). 4 tools (list_annotations, get_annotation, resolve_annotation, reopen_annotation). Stdio transport. BugHerd MCP is "coming soon"; TEB ships working first.

**Test growth across the sprint:** 175 → 207 (+32 new tests across bug-mode, page-mode hint, bulk ingest, MCP server).

**Hallucination audits:**
- GH audit agent: 2 false claims caught + corrected (.tgz tracked, stale origin branches).
- Dependabot triage agent: 1 false-positive injection report on `apps/worker/package.json` (file confirmed clean by direct Read). Logged here as a meta-observation; not as an injection log incident. The broad context7 campaign has trained agents to over-report; new defensive pattern: verify alleged injections with direct Read before logging.

**Open at EOD:**
- 6 dependabot PRs:
  - #27, #28, #29, #30 (GH Actions v6/v7 bumps): CI green, triage recommends MERGE NOW (sequential rebase due to strict branch protection)
  - #31 (npm dev-deps group: Biome 2 + Vitest 4 + TS 6 + Wrangler 4 + happy-dom 20): HOLD per triage; close + reopen per-package each with its own migration
  - #32 (npm prod-deps group: `@medv/finder` v4 + `next` v16): HOLD per triage; `@medv/finder` is core anchor logic, needs regression test before merge
- TEB per-project memory dir now exists; subsequent updates go to this file
- Pivotal vendor at 0.0.7 (locked); will update if Cole asks
- LS vendor at 0.0.3 on origin/main; Phase 2 work will bump to 0.0.10 + add multi-tenant scaffolding
- CODE-side: 3 legacy thread files at `~/code/CODE/memory/threads/travisEATSbugs-*.md` are now superseded by this dir; can be `git rm`'d on a CODE-side cleanup PR when CODE working tree is clean

**Phase 2 entry point (next session or whenever Travis green-lights):**
- LS migrations 053 (tenant_id) + 054 (kind catch-up) + 055 (lions_clients EATS fields)
- LS API: `/api/clients/[id]/embed-token` + `/api/clients/[id]/logo` + tenant-scoped `/api/page-notes`
- LS UI: `/pack/[client]/widget-config` + `/pack/[client]/feedback-inbox`
- TEB worker: tenant-aware routing + auth gate (D4 magic-link token check)
- Jesse picks pilot client + smokes end-to-end

### 2026-05-20 (late, colleague-send polish sprint)

**Trigger**: Travis preparing to send links (BugHerd, travisEATSbugs, travisfixes.com) to Adam Masonbrink + Rikard Arkebäck at timeglass.ai after a sales/demo meeting. Wanted everything 100% accurate and clean for an external CEO-level read.

**TEB repo (travisbreaks/travisEATSbugs):**
- PR [#37](https://github.com/travisbreaks/travisEATSbugs/pull/37) chore(memory): MERGED. Sprint wrap-up to thread-state.
- PR [#38](https://github.com/travisbreaks/travisEATSbugs/pull/38) chore(version): MERGED. Aligned widget + adapter-cloudflare + adapter-http to 0.0.10-alpha.0 (they had drifted to 0.0.9 while MCP shipped at 0.0.10). README status line + BUGS.md + roadmap.md updated.
- PR [#39](https://github.com/travisbreaks/travisEATSbugs/pull/39) chore(community): MERGED. CODE_OF_CONDUCT.md (Contributor Covenant 2.1, contact: security@travisfixes.com) + removed grouping rule from dependabot.yml to get per-package PRs going forward.
- PR [#46](https://github.com/travisbreaks/travisEATSbugs/pull/46) docs: MERGED. Replaced broken install snippets in README + docs/install.md + docs/architecture.md. The old `https://eats.travisfixes.com/v1.js` URL returned 401 (worker only serves API) and `pnpm add @travisbreaks/travisEATSbugs` returned 404 (not on npm). Replaced with `<script src="https://travismakes.org/travis-eats-bugs/widget.js"></script>` which actually returns 200 + serves the IIFE bundle. Caught only on Travis's "you better be fucking sure" gate; would have shown broken install snippets to Adam on click-through from marketing.
- Dependabot merge train: #27, #28, #29, #30 (GH Actions v6/v7 bumps) all MERGED. Workflow now uses checkout@v6 + setup-node@v6 + pnpm/action-setup@v6 + upload-artifact@v7.
- #31, #32 group PRs: auto-closed by dependabot when ungrouping landed.
- 5 new dependabot PRs (#40, #41, #42, #43, #44) auto-opened after ungrouping. #42 (better-sqlite3 12) initially green but went red on Node 20 after rebase against the v6/v7 actions baseline. All 5 closed; tracking issue [#45](https://github.com/travisbreaks/travisEATSbugs/issues/45) opened with per-package migration notes for next 16, vitest 4, happy-dom 20, wrangler 4, better-sqlite3 12.
- Released v0.0.10-alpha.0 (annotated tag + GitHub Release with notes pulled from roadmap + BUGS.md, marked prerelease).
- Closed issues #1, #2, #3, #4, #5, #6, #7, #8, #9, #11 with version-pointer comments mapping each to the roadmap section that shipped it.
- Open-PR count: 6 -> 0. Open-issue count: 15 -> 6 (all 6 genuinely pending).

**CODE repo (travisbreaks/CODE):**
- PR [#231](https://github.com/travisbreaks/CODE/pull/231) chore(marketing): MERGED + DEPLOYED. Refresh of `travismakes-org/travis-eats-bugs/` (TEB marketing) + em-dash sweep on `travisfixes-com/` (index + about + patterns + protocol + work/livid-instruments).
  - TEB marketing changes: fresh 0.0.10 widget bundle, hero badge "0.0.10-alpha / actively building", install snippet rewritten to use the working travismakes.org URL, three FAQs rewritten to stop describing shipped features as future, mailing copy "v1.0 ships", console `info()` + `source()` updated.
  - travisfixes.com changes: 12 em-dashes removed (title + OG + Twitter + mailto + CSS comments). Allowed `-Travis` Credo sign-off preserved. "Currently shipping" line now leads with travisEATSbugs alongside NemoClaw + Thunder Stage + Nameless Cemetery.
- Deploys verified live via curl after merge: travismakes.org/travis-eats-bugs/, travisfixes.com, /about, /patterns, /protocol all return 0 em-dashes.

**GitHub profile (travisbreaks/travisbreaks):**
- Pushed slim README direct to main (single commit, no PR; solo-owned repo).
- Cut: Featured Projects table, GitHub-stats badges, Stack tags row. Kept: bio, 4 destination badges (Portfolio, Consulting, Transmissions, SoundCloud).
- Rationale per Travis: "less is more, let the pinned repos do the showcase work."

**Known follow-ups (not blocking the send):**
- `travismakes-org/index.html` root has 3 title em-dashes (browser tab, OG, Twitter). NOT touched because the Model Guide v2 thread has uncommitted edits to that file in the CODE working tree (Claude 4.7 card refresh at lines 489+). Per `git-discipline.md` the rule against cross-thread working-tree manipulation applies. Clean up on a dedicated branch once Model Guide v2 commits.
- `travisfixes-com/share/claude-model-guide/index.html` has 2 CSS-comment em-dashes; same Model Guide v2 cross-thread reason, also not user-visible.

**Hallucination catches (the things that would have made us look bad):**
- README + docs/install.md + docs/architecture.md were all promising a CDN URL that returns 401 and an npm package that 404s. Fixed in PR #46. Travis's explicit pre-send "you better be fucking sure" was what surfaced the docs/install.md side; the README side had been caught a few minutes earlier on the same check. Lesson: the marketing-site audit caught the broken claim there but I didn't propagate the same audit to the README and docs. Always sweep all surfaces where the claim appears, not just the most visible one.
- The original audit included a flag on `travisfixes-com/index.html:1803` "NVIDIA NemoClaw OSS contributions" claim being possibly aspirational; Travis confirmed to leave it and add more shipped items. Added travisEATSbugs at the front of the Currently-shipping list.

**Memory notes for future-self:**
- Pre-send audits should always sweep README + docs/ alongside marketing surfaces. The same broken claim was in four places (marketing + README + install.md + architecture.md); fixing one is not fixing the rest.
- For "polish for an external send to a CEO" work, the threshold is higher than for normal alpha-quality. Verify install snippets by actually curling them. Verify version claims across every surface. Trust nothing.
