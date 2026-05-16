# Contributing to travisEATSbugs

Thanks for the interest. This project is small + opinionated. Read this before you spend time on a PR.

## Where to start

- **Bug report?** → [Open an issue](https://github.com/travisbreaks/travisEATSbugs/issues/new?template=bug_report.md).
- **Feature idea or design question?** → [Start a discussion](https://github.com/travisbreaks/travisEATSbugs/discussions) first. Saves both of us a round trip if the idea isn't in scope.
- **Code change?** → Read the rest of this doc.

## Local setup

Requires Node 20 or 22 and pnpm 9.

```bash
git clone https://github.com/travisbreaks/travisEATSbugs.git
cd travisEATSbugs
pnpm install
pnpm -r build
pnpm -r test
```

Workspace layout:

| Path | What |
|---|---|
| `packages/widget` | The shadow-DOM widget. Pure UI + adapters. |
| `packages/adapter-cloudflare` | D1-backed `ApiAdapter` |
| `packages/adapter-http` | fetch-backed REST `ApiAdapter` |
| `apps/playground` | Next.js demo app. Static export. |
| `apps/worker` | Cloudflare Worker for AI triage + share-token verification |
| `docs/` | Architecture, design, implementation guide, roadmap |

## Running the playground

```bash
cd apps/playground
pnpm dev
```

Then visit [http://localhost:3000](http://localhost:3000). The widget loads inline; the bug button bottom-right is the entry point. Comments persist in `localStorage` by default.

## What I'll merge

- Bug fixes with a regression test.
- Adapter implementations for other backends.
- Accessibility improvements + reduced-motion fixes.
- Documentation that closes specific gaps reported in issues.
- Minor performance work with a benchmark.

## What I'll likely close

- Big architectural rewrites without prior discussion. Open a discussion first.
- Adding hard dependencies (the widget intentionally keeps its tree minimal: `@medv/finder` + `modern-screenshot` only).
- Style tweaks the host can do via CSS custom properties (the widget exposes a theme contract; use it).
- Anything that breaks the no-shift principle, the Shadow DOM isolation, or the reduced-motion gate.

## Code style

- Biome handles formatting + linting. Run `pnpm exec biome check --write .` before committing.
- TypeScript strict. No `any` without a comment explaining why.
- Tests in Vitest. Aim for the behavior, not the implementation.
- Commit messages: conventional commits-ish. `feat(scope): ...`, `fix(scope): ...`, `chore: ...`.

## PR checklist

- [ ] `pnpm -r test` is green
- [ ] `pnpm exec biome check .` is clean
- [ ] New behavior is documented (README, docs/, or inline JSDoc)
- [ ] No new dependencies added unless explicitly justified in the PR description
- [ ] If you changed an adapter, the contract tests still pass

## Code of conduct

Be direct, be respectful, don't waste people's time. Constructive disagreement is fine; personal attacks are not.

## License

By contributing, you agree your contribution is licensed under Apache 2.0, the same license as the rest of the repo.
