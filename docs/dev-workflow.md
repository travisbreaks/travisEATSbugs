# travisEATSbugs dev workflow

How to iterate on the widget while it's actively consumed by Pivotal + Lion's Share (and future consumers).

## The shape of the loop

```
┌────────────────────────┐
│  travisEATSbugs        │  ← canonical source (this repo)
│  packages/widget/src   │
└──────────┬─────────────┘
           │ pnpm build + npm pack
           ▼
┌────────────────────────┐
│  *.tgz tarball         │  ← versioned, byte-frozen snapshot
└──────────┬─────────────┘
           │ cp app/vendor/ + npm install
           ▼
┌────────────────────────┐   ┌────────────────────────┐
│  Pivotal               │   │  Lion's Share          │
│  app/vendor/...tgz     │   │  app/vendor/...tgz     │
└────────────────────────┘   └────────────────────────┘
```

Two-step distribution: source → tgz → consumer. Versioned by the widget's `package.json` so consumers know when they should re-vendor.

## Why tgz instead of npm publish (for now)

- TEB is pre-stable (0.0.x). Breaking changes happen.
- npm publish is one-way; published versions stay forever.
- tgz lets us iterate quickly without polluting the public npm namespace.
- When TEB stabilizes (~0.1.x), the move to `npm publish` is one command + a `npm update` per consumer.

## When you find a bug or want a feature

### As a consumer (reporting from Pivotal or Lion's Share)

1. Log it under "Open" in `BUGS.md` with: short title, date, consumer, repro, expected vs actual.
2. If you're the same person who can fix it: branch off main in this repo.

### As the widget maintainer (fixing)

1. `git checkout -b fix/<short-name>` in this repo
2. Edit `packages/widget/src/...`
3. `npm run typecheck && npm run test` (vitest, happy-dom)
4. Bump `packages/widget/package.json` version (`0.0.N-alpha.M` → bump M for fixes, N for features)
5. `npm run build` (tsup produces dist/)
6. `npm pack` (produces `travisbreaks-travisEATSbugs-X.Y.Z-alpha.W.tgz`)
7. For each consumer:
   - `cp packages/widget/travisbreaks-travisEATSbugs-X.Y.Z-alpha.W.tgz <consumer>/app/vendor/`
   - Update the consumer's `app/package.json` if the filename changed (the path includes the version)
   - `npm install --prefix <consumer>/app` to pick up the new tarball
   - Deploy the consumer
8. Update `BUGS.md` "Fixed" section + bump the "Versions" table
9. Commit + push + PR in this repo. Each consumer's re-vendor lands in a separate PR in that repo.

## Consumer paths (registry)

When you ship a new version, re-vendor into every consumer below.

| Consumer | Vendor path | Repo |
|---|---|---|
| Pivotal | `~/code/pivotal-platform/app/vendor/` | `travisbreaks/pivotal-platform` |
| Lion's Share | `~/code/CODE/lions-share/app-cf/vendor/` | `travisbreaks/lions-share-os` (or whichever active) |

(Add new consumers here as they adopt the widget.)

## Quick rebuild + vendor script

A `scripts/rebuild-and-vendor.sh` (TODO) will eventually automate steps 5-7. For now, do them by hand so each consumer's deploy gates run independently.

## Versioning

Pre-1.0 the bump rule is informal:
- Patch (`0.0.N-alpha.M+1`): single-file bug fix, no API surface change.
- Minor (`0.0.N+1-alpha.0`): new behavior or new export; backwards-compatible.
- Major (`0.N+1.0-alpha.0`): breaking API change; consumers MUST update call sites before re-vendoring.

After 0.1.0 we switch to strict SemVer + npm publish.

## Why a custom `BUGS.md` instead of GitHub issues

- Cross-consumer audit trail (one file shows everything across Pivotal + Lion's Share + others).
- Survives repo migrations / forks (issues don't).
- Consumer fix notes live next to the symptom in source, not on a separate web surface.
- We can still mirror to GH issues later if a contributor base materializes.

The `BUGS.md` is the source of truth; GH issues are optional discussion threads on top.
