<!-- Thanks for the PR. Fill in what's relevant; leave the rest. -->

## What

<!-- One sentence describing the change. -->

## Why

<!-- The problem this solves. Link the issue / discussion if there is one (`Closes #N`). -->

## How

<!-- Implementation notes for the reviewer. Tradeoffs, things you considered + rejected, anything subtle. -->

## Checklist

- [ ] `pnpm -r test` is green
- [ ] `pnpm exec biome check .` is clean
- [ ] New behavior documented (README, docs/, or JSDoc)
- [ ] No new dependencies added (or explained in the description if added)
- [ ] If you changed an adapter, the contract tests still pass
- [ ] Reduced-motion + Shadow DOM isolation + no-shift principle intact
