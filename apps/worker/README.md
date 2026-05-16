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

The `UpdatePatch` shape is strictly discriminated (body OR resolve OR reopen OR overlap, never combined). The worker returns 400 on mixed-shape patches per the same rule the adapter enforces.

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

## Deploy (when ready)

```bash
# 1. One-time CF auth
wrangler login

# 2. Create the D1 database (record the id it prints)
wrangler d1 create travisEATSbugs

# 3. Paste the id into wrangler.toml under [[d1_databases]].database_id

# 4. Apply migrations to the live D1
pnpm migrate:remote

# 5. Set the share-token HMAC secret (32+ random bytes)
wrangler secret put SHARE_TOKEN_SECRET

# 6. (Optional) set member tokens
wrangler secret put MEMBER_TOKENS

# 7. (Optional) set CORS allow-list
wrangler secret put ALLOWED_ORIGINS

# 8. Deploy
pnpm deploy

# 9. After DNS for eats.travisfixes.com exists, uncomment the routes
#    block in wrangler.toml and redeploy.
```

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

## What's NOT in v0.2

- Per-project D1 isolation (one D1 per project): currently single D1 shared across all projects. v0.3+ if needed.
- AI triage `onCreate` webhook: v0.5.
- R2 screenshot capture: v0.5 (binding declared but commented out in wrangler.toml).
- GitHub Issues / Linear / Jira sync: v0.6.
