# Installing travisEATSbugs

**Status:** alpha (`0.0.10-alpha.0`). A dedicated CDN endpoint and a public npm publish both land at v1.0. Until then, the install paths below are how to drop the widget into a real app today.

## Option 1: Script tag (alpha demo)

Drop in the same bundle the [live demo](https://travismakes.org/travis-eats-bugs/) uses, served from the travismakes.org static site:

```html
<script src="https://travismakes.org/travis-eats-bugs/widget.js"></script>
```

The bundle exposes `window.travisEATSbugs`. Wire it up with the localStorage adapter (browser-only, no backend needed):

```html
<script>
  const api = new window.travisEATSbugs.LocalStorageAdapter({
    namespace: 'my-app-feedback',
    currentUser: { id: 'demo-visitor', display: 'You' },
  })
  const pageMode = new window.travisEATSbugs.AnnotationPageMode({
    api,
    hintText: 'Click any element on this page to drop a note',
  })
  pageMode.mount()
  window.travisEATSbugs.init({
    onToggle: (active) => active ? pageMode.activate() : pageMode.deactivate(),
  })
</script>
```

Good for prototypes, demos, internal-only feedback flows. Notes live in the visitor's browser; nothing leaves their machine.

## Option 2: Vendor the bundle from the repo

For production use, clone the repo, build the widget, and serve the bundle from your own CDN:

```bash
git clone https://github.com/travisbreaks/travisEATSbugs.git
cd travisEATSbugs
pnpm install
pnpm --filter @travisbreaks/travisEATSbugs run build
```

The IIFE bundle lands at `packages/widget/dist/index.global.js`. Drop it into your asset pipeline (`/static/`, an R2 bucket, your own CDN, whatever).

## Option 3: Vendor the workspace as a pnpm dependency

If your app is JS-bundled (React, Vue, Svelte, Solid, etc), you can vendor the widget package directly while waiting for the public npm publish. From your app:

```bash
pnpm pack /path/to/travisEATSbugs/packages/widget
pnpm add ./travisbreaks-travisEATSbugs-0.0.10-alpha.0.tgz
```

Then in your app entry point:

```ts
import { init, AnnotationPageMode, LocalStorageAdapter } from '@travisbreaks/travisEATSbugs'

const api = new LocalStorageAdapter({ namespace: 'my-app' })
const pageMode = new AnnotationPageMode({ api })
pageMode.mount()
init({ onToggle: (active) => active ? pageMode.activate() : pageMode.deactivate() })
```

## Option 4: Self-hosted Cloudflare worker + D1

For a persistent backend with full multi-user CRUD + AI triage, deploy the worker package to your own Cloudflare account:

```bash
git clone https://github.com/travisbreaks/travisEATSbugs.git
cd travisEATSbugs/apps/worker
pnpm install
# Configure wrangler.toml with your D1 binding and secrets
pnpm wrangler deploy
```

Point the widget at your worker by swapping the adapter:

```ts
import { httpAdapter } from '@travisbreaks/travisEATSbugs-http'
import { init } from '@travisbreaks/travisEATSbugs'

const api = httpAdapter({
  baseUrl: 'https://your-worker.your-subdomain.workers.dev',
  headers: { Authorization: `Bearer ${process.env.MEMBER_TOKEN}` },
})
init({ adapter: api, ... })
```

The worker exposes `/annotations`, `/annotations/bulk`, `/authors`, and `/triage` (opt-in AI classification via `ANTHROPIC_API_KEY`). See [architecture.md](./architecture.md) for the full data model and adapter contracts.

## What about the hosted backend at `eats.travisfixes.com`?

The Cloudflare worker that backs the maintainer's own deployments is live at `https://eats.travisfixes.com`. It is **not a public signup destination** today. The route surface is the same as Option 4 (you'd authenticate with a member token and call the same endpoints), but member token provisioning is a manual step out-of-band. A signup UI + public hosted tier land in the paid `teb-cloud` repo, not in this OSS repo.

## Picking between options

| If you want to... | Use option |
|---|---|
| Try the widget on your site in 60 seconds with no backend | 1 (script tag + localStorage) |
| Ship the widget on a production site with your own CDN | 2 (vendor the bundle) |
| Use the widget inside a JS-bundled app (React/Vue/etc) | 3 (pnpm pack + vendor) |
| Run the full hosted-backend topology on your own Cloudflare | 4 (self-hosted worker) |
