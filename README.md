# travisEATSbugs

> Drop-in visual-feedback widget for any web app. One-line install. Click anywhere to mark. Animated sticky-note pins. Screenshot capture. Stable element anchoring. AI triage. Open source.

**Status:** alpha. v0 scaffold. The API will change.

## Install (when v0.1 ships)

```html
<script src="https://eats.travisfixes.com/v1.js" data-project="YOUR_PROJECT_TOKEN"></script>
```

Or via npm:

```bash
pnpm add @travisbreaks/travisEATSbugs
```

```ts
import { init } from '@travisbreaks/travisEATSbugs'

init({ project: 'YOUR_PROJECT_TOKEN' })
```

## What it does

- Visitors press a hotkey or click the bug icon, then click any element on the page to leave a comment.
- The widget captures a screenshot, anchors the comment to a stable element selector (CSS + XPath + visible text), and stores it.
- An admin dashboard (yours or ours) shows the queue, triages, assigns, and links resolutions back to the originating pin.
- Optional AI triage: each new comment is classified for severity, category, suggested assignee, and possible duplicates by Claude.

## Why this exists

Most visual-feedback tools (BugHerd, Marker.io, Userback) are SaaS-only, $42-150/mo, with proprietary backends. travisEATSbugs is open source, self-hostable, and built so it can sit on top of any product without forcing the host into our backend.

The agency-bundle gap is what makes it interesting: no existing tool ships visual feedback + project rollups + hours tracking + client lists in one product. We can.

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Design

Theming, no-shift principle, reduced-motion handling, and per-product brand canon: see [docs/design.md](docs/design.md). The widget exposes CSS custom properties so host pages recolor without touching widget code.

## License

Apache 2.0. See [LICENSE](LICENSE).

## Author

[Travis Bonnet](https://travisfixes.com) ([@travisbreaks](https://github.com/travisbreaks))
