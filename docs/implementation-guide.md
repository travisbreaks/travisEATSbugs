# travisEATSbugs implementation guide

Add the BugHerd-style "click anywhere on the page to drop a pin" interaction to any site, without removing whatever feedback / notes / inbox surfaces already exist.

## The thing to use

- **Package**: [`@travisbreaks/travisEATSbugs`](../packages/widget) (pnpm add)
- **Renderer**: [`AnnotationPageMode`](../packages/widget/src/page-mode.ts) — shadow-DOM overlay on `document.body`, click-anywhere capture, on-page pin overlay anchored to elements via CSS selector + xpath
- **Bug button**: [`init` / `toggle` / `destroy`](../packages/widget/src/bug-mode.ts) — floating launcher with the wiggle. To get the lively wiggle on a button you've already themed, just remove any `animation: none` override you set.
- **Environment capture**: [`captureEnvironment`](../packages/widget/src/environment.ts) — URL / OS / browser / screen / window / color depth. Page-mode calls it automatically on every new pin.
- **Anchor capture**: [`captureRouteAnchor`](../packages/widget/src/anchor-route.ts) — CSS selector via `@medv/finder` + xpath fallback. Called automatically.
- **Annotation shape** (what an adapter persists): [packages/widget/src/types.ts](../packages/widget/src/types.ts)
- **Adapter contract**: [packages/widget/src/adapters.ts](../packages/widget/src/adapters.ts). Reference implementations: [MemoryAdapter](../packages/widget/src/adapter-memory.ts), [LocalStorageAdapter](../packages/widget/src/adapter-localstorage.ts), [CloudflareAdapter](../packages/adapter-cloudflare/src/cloudflare-adapter.ts).
- **Live demo**: [apps/playground/app/page.tsx](../apps/playground/app/page.tsx) shows the full wiring with `MemoryAdapter`. The marketing page at [travismakes-org/travis-eats-bugs/index.html](../../travismakes-org/travis-eats-bugs/index.html) shows the same wiring with `LocalStorageAdapter` via the IIFE bundle.

## Desired end state

- Floating bug button bottom-right, present on every page that should accept feedback.
- Click the bug button → cursor becomes a crosshair, hint ribbon appears, every page element becomes a click target.
- Click any element → sticky-note compose form opens at the click point with an "Additional Info" panel (URL, OS, browser, selector, resolution, window size, color depth).
- Submit → pin persists, anchored to the clicked element. Pin re-positions on scroll/resize via the stored selector.
- Toggle bug button off → pins hide, feedback mode disarms. Toggle back on → pins return.
- New pins flow into whatever inbox / task-list / aggregator the host site already has, via the `ApiAdapter` the host implements.
- Any existing drawer / inbox / notes surface is untouched. Page-mode is additive.

## What the host has to write

One `ApiAdapter` (`list`, `create`, `update`, `delete`) that talks to the host's existing backend. The widget owns no I/O — it calls the adapter and renders the result. Sites that just want a demo with no backend can use `LocalStorageAdapter` as-is.

If the host's existing data shape doesn't carry `environment` (JSON), `anchor.xpath`, or `anchor.textQuote.*`, add optional columns. Old rows without them keep working — the widget renders "(unknown)" for missing fields.

## Wiring shape (copy + adapt)

```ts
import {
  AnnotationPageMode,
  destroy as destroyBugButton,
  init as initBugButton,
} from '@travisbreaks/travisEATSbugs'
import { createYourAdapter } from './your-adapter'

const api = createYourAdapter(/* whatever your auth + endpoint needs */)
const pageMode = new AnnotationPageMode({ api })
pageMode.mount()

initBugButton({
  project: 'your-site',
  onToggle: (active) => {
    if (active) pageMode.activate()
    else pageMode.deactivate()
  },
})

// cleanup on unmount:
// pageMode.destroy(); destroyBugButton();
```

## What this guide intentionally does NOT do

- Tell you to remove anything that's working.
- Wire integrations to GitHub Issues / Linear / Jira / Slack. Post-MVP, separate pass.
- Prescribe a backend. The adapter is your choice.

If anything in this guide conflicts with what you find in the playground or in `types.ts`, the code wins.
