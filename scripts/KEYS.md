# Secrets for travisEATSbugs

This project follows the [Theoria keyholder pattern](../../theoria/scripts/KEYS.md): all API secrets live in the macOS login Keychain, accessed via the `security` CLI. Never in `.env` files, never committed, never logged.

## Why Keychain, not .env

- Values are encrypted at rest, OS-guarded.
- Accessible only via `security` CLI which prompts for Keychain unlock the first time per session and then caches.
- No risk of `.env.local` getting accidentally committed, screenshotted, or scraped from telemetry.
- Pasting a key once via `-w` flag (hidden input) is safer than pasting via shell variable assignment (which lands in shell history).

## Stored entries

| Keychain service name | Purpose | Used by |
|---|---|---|
| `REPLICATE_API_TOKEN` | Replicate API token (Recraft V3 SVG, other model calls) | `scripts/bake-off-recraft.ts` |

Naming: shared (no `TEB_` prefix) because Replicate is cross-project. Pivotal, Lions Share, Theoria, and any other Travis project can read the same entry.

## Storing a key

One-time setup per machine:

```bash
security add-generic-password -U -a "$USER" -s "REPLICATE_API_TOKEN" -w
```

The `-w` flag with no value triggers a hidden-input prompt. Paste the token, hit Enter. Stored.

The `-U` flag means "update if it already exists," so re-running this rotates the value safely.

## Reading a key

From the shell:
```bash
security find-generic-password -s "REPLICATE_API_TOKEN" -w
```

From a script (TypeScript / Node):
```ts
import { execFileSync } from 'node:child_process'

const token = execFileSync(
  'security',
  ['find-generic-password', '-s', 'REPLICATE_API_TOKEN', '-w'],
  { encoding: 'utf8' },
).trim()
```

`execFileSync` (not `execSync`) so arguments are escaped properly and the service name can't be shell-injected.

## Deleting a key

```bash
security delete-generic-password -s "REPLICATE_API_TOKEN"
```

## Rotating a key

Same as storing: the `-U` flag updates in place.

```bash
security add-generic-password -U -a "$USER" -s "REPLICATE_API_TOKEN" -w
```

After rotating, scripts pick up the new value on next run. No restart needed.

## Auditing what's stored

```bash
security dump-keychain | grep -E '"svce"|"acct"' | head -40
```

Or just look in Keychain Access.app under the "login" keychain.
