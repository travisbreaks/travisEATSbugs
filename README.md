# travisEATSbugs

[![CI](https://github.com/travisbreaks/travisEATSbugs/actions/workflows/ci.yml/badge.svg)](https://github.com/travisbreaks/travisEATSbugs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@travisbreaks/travisEATSbugs.svg)](https://www.npmjs.com/package/@travisbreaks/travisEATSbugs)

> Drop-in visual-feedback widget for any web app. Click anywhere on a page, leave a sticky-note comment anchored to the clicked element, ship the fix. Open source, self-hostable, no logins or Jira required.

**Live demo:** [travismakes.org/travis-eats-bugs/](https://travismakes.org/travis-eats-bugs/) — the marketing page itself is the playground. Click the bug button bottom-right.

**Status:** alpha (`0.0.1-alpha.0`). API surface is stabilizing.

## Install

CDN:

```html
<script src="https://eats.travisfixes.com/v1.js" data-project="YOUR_PROJECT_TOKEN"></script>
```

npm / pnpm / yarn:

```bash
pnpm add @travisbreaks/travisEATSbugs
```

```ts
import { init } from '@travisbreaks/travisEATSbugs'

init({ project: 'YOUR_PROJECT_TOKEN' })
```

## What it does

- Visitors click the bug icon, then click any element on the page to leave a comment.
- The widget captures a stable element selector (`@medv/finder` CSS path + XPath + W3C text-quote), environment metadata (browser, OS, viewport, language, timezone), and an optional screenshot.
- Comments are scoped per route by default; spatial pin-on-pixel mode is available via the overlay renderer for apps where elements move freely.
- All UI lives inside a Shadow DOM so host CSS can never collide with widget styles.
- An admin can triage, assign, resolve, and link comments back to merged PRs.
- Optional AI triage via Anthropic Claude classifies severity, category, suggested assignee, and possible duplicates per comment.

## Why this exists

Most visual-feedback tools (BugHerd, Marker.io, Userback) are SaaS-only, $42-150/month per project, with proprietary backends. travisEATSbugs is the inverse: Apache 2.0, self-hostable, and built so a single drop-in widget works across every product you ship without forcing the host into someone else's backend.

## Architecture

Three layers, three adapter contracts:

| Layer | Contract | Purpose |
|---|---|---|
| Widget | (no contract) | Pure UI + DOM. Owns no I/O. |
| Persistence | `ApiAdapter` | Implement `list / create / update / delete / listAuthors`. |
| Identity | `AuthAdapter` | Implement `getCurrentUser` (and optionally `canAdmin`). |
| Theming | `ThemeAdapter` | Per-host display labels, button copy, severity inference. |

Reference adapters in this repo:
- `@travisbreaks/travisEATSbugs-cloudflare` — D1-backed with full CRUD + audit log
- `@travisbreaks/travisEATSbugs-http` — fetch-backed REST adapter
- In-memory + localStorage adapters for prototyping (built into the widget package)

See [docs/architecture.md](docs/architecture.md) for the full data model + anchor schema.

## Render modes

| Mode | Best for | Anchor |
|---|---|---|
| `drawer` | Document-style apps (CMS, dashboards, docs sites) | Route + optional element selector |
| `overlay` | Spatial apps (boards, canvases, image annotations) | Pixel coordinates on a named surface |
| `page-mode` | Click-to-pin on any page element | Element selector + xpath + text-quote |

## Documentation

- [Architecture](docs/architecture.md) — data model, anchor schema, adapter contracts
- [Design](docs/design.md) — theming, no-shift principle, reduced-motion, brand canon
- [Implementation guide](docs/implementation-guide.md) — adapter writing walkthrough
- [Install](docs/install.md) — CDN, npm, self-hosted worker
- [Roadmap](docs/roadmap.md) — what's shipped, what's queued

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports + feature requests via [Issues](https://github.com/travisbreaks/travisEATSbugs/issues); design conversations via [Discussions](https://github.com/travisbreaks/travisEATSbugs/discussions).

Security disclosure: see [SECURITY.md](SECURITY.md).

## License

Apache 2.0. See [LICENSE](LICENSE).

## Author

[Travis Bonnet](https://travisfixes.com) ([@travisbreaks](https://github.com/travisbreaks))
