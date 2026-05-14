# Roadmap

## v0: Scaffold (2026-05-14)

- [x] Repo + monorepo layout
- [x] License (Apache 2.0)
- [x] `packages/widget/` with floating bug button v0
- [x] `apps/playground/` with widget loaded
- [x] `docs/architecture.md`
- [ ] CI workflow
- [ ] Branch protection
- [ ] GitHub issues per v1 feature

## v0.1: Anchor + pin (target: 1 week)

- [ ] Click-to-mark mode (cursor changes, click any element)
- [ ] Triple-selector anchoring (`@medv/finder` + XPath + text-quote)
- [ ] Screenshot capture (modern-screenshot)
- [ ] Sticky-note pin UI (Motion + paper texture)
- [ ] localStorage adapter
- [ ] W3C Web Annotation Data Model on-disk

## v0.2: HTTP adapter + share links

- [ ] BYO HTTP adapter (`@travisbreaks/travisEATSbugs-http`)
- [ ] Tokenized unguessable share-link mode
- [ ] Reporter name prompt on first comment, stored in localStorage
- [ ] Pin kinds (bug / idea / question / praise) with color coding

## v0.3: Hosted backend

- [ ] Cloudflare D1 + R2 adapter (`@travisbreaks/travisEATSbugs-cloudflare`)
- [ ] Worker deployed at `eats.travisfixes.com`
- [ ] Admin dashboard (separate package or app)
- [ ] Resolved-PR link-back (port from Pivotal page-notes seed)

## v0.4: AI triage

- [ ] `onCreate` webhook to triage worker
- [ ] Claude classifier: severity / category / suggested_assignee / dupe_of
- [ ] Response written back as W3C `body` field

## v0.5: Integrations

- [ ] GitHub Issues two-way sync
- [ ] Linear two-way sync
- [ ] Jira two-way sync
- [ ] Slack notification webhook

## v1.0: Public release

- [ ] Public npm release
- [ ] Documentation site at eats.travisfixes.com
- [ ] Marketing site
- [ ] Live demo
- [ ] Example integrations (React, Vue, Svelte, vanilla)

## Future / unscheduled

- [ ] Real-time collab via Yjs over Cloudflare Durable Objects
- [ ] Mobile-app SDK (React Native, native iOS/Android)
- [ ] Drawable annotation mode (Excalidraw embed)
- [ ] Session replay for bug repro
