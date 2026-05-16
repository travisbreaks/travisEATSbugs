# travisEATSbugs Worker

Cloudflare Worker hosting the default backend at `eats.travisfixes.com`. Implements the REST contract that `@travisbreaks/travisEATSbugs-http` calls, backed by a D1 database whose schema lives in `packages/adapter-cloudflare/migrations/`.

## Status

v0.2 scaffold. Local build + tests are green. Live deploy is a separate step: see "Deploy" below. DNS / route binding requires the `eats.travisfixes.com` subdomain to exist in the travisfixes.com CF zone.

## REST contract

All routes require `Authorization: Bearer <token>`. `<token>` is either:
- A member token from the `MEMBER_TOKENS` env var (comma-separated; literal match)
- A share-link token signed with `SHARE_TOKEN_SECRET` (HMAC-SHA256, see `src/share-token.ts`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/annotations?mode=&path=&surfaceId=&state=` | : | `Annotation[]` |
| POST | `/annotations` | `CreateInput` | `Annotation` (201) |
| PATCH | `/annotations/:id` | `UpdatePatch` | `Annotation` |
| DELETE | `/annotations/:id` | : | 204 |
| GET | `/authors` | : | `AuthorRef[]` |
| POST | `/triage` (member-only) | `{ annotation, recent? }` | `TriageResult` |

The `UpdatePatch` shape is strictly discriminated (body OR resolve OR reopen OR overlap OR triage OR anchor, never combined). The worker returns 400 on mixed-shape patches per the same rule the adapter enforces.

`/triage` is **opt-in**: with no `ANTHROPIC_API_KEY` env set, it returns 503 + `triage_not_configured`. With a key set, it calls Claude (`claude-sonnet-4-6` by default; overridable via `ANTHROPIC_MODEL`) with tool-use forced structured output and returns a `TriageResult`. Reporter-mode share-link tokens get 403; only member tokens spend Anthropic credits.

## Local dev

```bash
cd apps/worker
pnpm install         # workspace handles linking
pnpm test            # vitest, runs handlers + share-token tests
pnpm typecheck       # tsc strict mode
pnpm lint            # biome
pnpm dev             # wrangler dev (requires wrangler login first)
```

`pnpm dev` runs the worker against a local D1 instance. The first time, run `pnpm migrate:local` to apply the migration.

## Deploy runbook (live at `eats.travisfixes.com`)

Step-by-step. Each command is meant to be run from `apps/worker/` unless noted.

### One-time

```bash
# 1. CF auth (opens browser)
wrangler login

# 2. Create the D1 database; record the id it prints
wrangler d1 create travisEATSbugs

# 3. Edit wrangler.toml: paste the id into [[d1_databases]].database_id

# 4. Apply both migrations (001_annotations.sql + 002_triage.sql) to live D1
pnpm migrate:remote
```

### Secrets (use the keychain; never paste keys into the chat)

```bash
# 5. HMAC secret for share-link tokens (32+ random bytes).
#    Generate once and store in keychain:
SHARE_TOKEN_SECRET=$(openssl rand -hex 32)
security add-generic-password -s TRAVISEATSBUGS_SHARE_TOKEN_SECRET -a $USER -w "$SHARE_TOKEN_SECRET"
unset SHARE_TOKEN_SECRET

# Pipe into wrangler so the secret never hits a shell history file:
keychain-get TRAVISEATSBUGS_SHARE_TOKEN_SECRET | wrangler secret put SHARE_TOKEN_SECRET

# 6. (Optional, but required for AI triage) Anthropic API key.
#    Create a fresh key scoped to this project. Store, then pipe:
keychain-get TRAVISEATSBUGS_ANTHROPIC_API_KEY | wrangler secret put ANTHROPIC_API_KEY

# 7. (Optional) member token allow-list. Generate 32-byte tokens per member:
#    one per admin who needs full read/write through the worker.
keychain-get TRAVISEATSBUGS_MEMBER_TOKENS | wrangler secret put MEMBER_TOKENS

# 8. (Optional) CORS allow-list (comma-separated origins).
#    Leave empty during dev; set in prod to lock the worker to your apps.
echo 'https://your-app.example.com' | wrangler secret put ALLOWED_ORIGINS
```

### Deploy + verify

```bash
# 9. Deploy
pnpm deploy

# 10. Smoke test before flipping DNS: the URL printed by `pnpm deploy`
#     should be a *.workers.dev hostname. Hit it directly:
curl -i https://travis-eats-bugs-worker.<your-subdomain>.workers.dev/annotations \
  -H "Authorization: Bearer $(keychain-get TRAVISEATSBUGS_MEMBER_TOKEN)"
# Expect 200 with []. Without auth, expect 401.

# 11. Smoke test triage (costs ~3 cents per call):
node ../../scripts/smoke-triage.mjs   # from anywhere in the repo
# Expect a TriageResult JSON. Confirms the model + tool schema work.

# 12. Flip DNS at Cloudflare:
#     - Open the travisfixes.com zone in CF dashboard
#     - Add a CNAME record: eats -> travis-eats-bugs-worker.<your-subdomain>.workers.dev
#     - Or use the Workers > Triggers > Custom Domain UI to bind eats.travisfixes.com
#       directly (simpler; CF manages the cert).

# 13. Uncomment the routes block in wrangler.toml:
#     routes = [{ pattern = "eats.travisfixes.com/*", custom_domain = true }]

# 14. Redeploy to pick up the route binding
pnpm deploy

# 15. Final verify on the live domain
curl -i https://eats.travisfixes.com/annotations \
  -H "Authorization: Bearer $(keychain-get TRAVISEATSBUGS_MEMBER_TOKEN)"
```

### Rollback

If the deploy goes sideways, `wrangler rollback` reverts to the previous version. The D1 database is unaffected. If a migration broke the schema, fix forward with a new migration; never edit applied migrations in place.

## Generating a share link

Hosts (Pivotal admin, Lion's Share team) generate share-link tokens by signing a `SharePayload` with the same `SHARE_TOKEN_SECRET`:

```ts
import { signShareToken } from '@travisbreaks/travisEATSbugs-worker/share-token'

const token = await signShareToken(
  {
    projectId: 'pivotal',
    reporterId: 'cole-cousin-jane',
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  },
  process.env.SHARE_TOKEN_SECRET,
)
// Hand the URL: https://your-app/?bugToken=<token>
```

The worker verifies the token on every request. Tampered, expired, or wrong-secret tokens get 401.

## What's NOT in v0.2 / v0.5

- Per-project D1 isolation (one D1 per project): currently single D1 shared across all projects. v0.3+ if needed.
- R2 screenshot capture binding wired into a real upload path: v0.5 ships the widget-side helper (`defaultScreenshotCapture` returns a data URL); hosts that want R2-backed storage pass their own `ScreenshotCaptureFn` that uploads + returns a CDN URL.
- GitHub Issues / Linear / Jira sync: v0.6.

## What IS in v0.5 (worker side)

- `POST /triage` route calling Claude with tool-use forced output. Opt-in via `ANTHROPIC_API_KEY`. Model overridable via `ANTHROPIC_MODEL`. Reporter (share-link) tokens get 403; only members spend Anthropic credits.
- Migration `002_triage.sql` adds 6 triage columns + 2 indexes (severity, category) for inbox sort patterns.
- `{ anchor: AnnotationAnchor }` UpdatePatch variant powers drag-to-reposition on spatial pins; also re-wires stale CSS selectors to a new selector/xpath without a delete+recreate.
