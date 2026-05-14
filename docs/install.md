# Installing travisEATSbugs

**Status:** v0 scaffold. The instructions below describe the v0.1+ target install paths.

## Option 1: CDN snippet (recommended for most users)

Add one line to your HTML `<head>`:

```html
<script src="https://eats.travisfixes.com/v1.js" data-project="YOUR_PROJECT_TOKEN"></script>
```

That's it. The widget injects a floating bug icon in the bottom-right of every page. Click it to enter mark mode.

## Option 2: npm package

If your app is JS-bundled (React, Vue, Svelte, Solid, etc):

```bash
pnpm add @travisbreaks/travisEATSbugs
```

Then in your app entry point:

```ts
import { init } from '@travisbreaks/travisEATSbugs'

init({
  project: 'YOUR_PROJECT_TOKEN',
  position: 'bottom-right', // optional
})
```

## Option 3: Self-hosted backend

If you want full control of where comments are stored, use the HTTP adapter:

```ts
import { init } from '@travisbreaks/travisEATSbugs'
import { httpAdapter } from '@travisbreaks/travisEATSbugs-http'

init({
  adapter: httpAdapter({
    baseUrl: 'https://your-app.com/api/feedback',
    headers: { Authorization: `Bearer ${token}` },
  }),
})
```

Your endpoint needs to implement the [Adapter interface](./architecture.md#store-pluggable-adapter).

## Option 4: Self-hosted on Cloudflare

If you want our backend topology but on your own Cloudflare account, deploy the worker package:

```bash
git clone https://github.com/travisbreaks/travisEATSbugs.git
cd travisEATSbugs/apps/worker
pnpm install
pnpm wrangler deploy
```

Then point the widget at your worker URL.

## Getting a project token

For the hosted backend (Option 1 or 2 without a custom adapter), sign up at [eats.travisfixes.com](https://eats.travisfixes.com) and create a project. The dashboard shows your token.

For self-hosted (Options 3 or 4), the token is whatever string you want; the widget passes it through unchanged.
