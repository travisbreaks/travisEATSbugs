# @travisbreaks/travisEATSbugs-mcp

Model Context Protocol server for travisEATSbugs. Exposes feedback annotations as MCP tools so AI agents (Claude Code, Claude Desktop, etc.) can list, inspect, resolve, and reopen notes against the canonical `eats.travisfixes.com` worker.

BugHerd announced "BugHerd MCP coming soon" in their 2025 wrap-up. TEB ships a working MCP server first as a public credibility marker.

## Tools (0.0.10-alpha.0)

| Tool | Description |
|---|---|
| `list_annotations` | List annotations; optional `path` + `state` filters |
| `get_annotation` | Fetch one by `id` |
| `resolve_annotation` | Mark resolved with `resolvedPR` + optional `resolutionNote` |
| `reopen_annotation` | Clear resolution; flip state back to open |

Coming in 0.0.11+:
- `bulk_create_annotations` (calls `POST /annotations/bulk` from 0.0.9)
- `triage_annotation` (calls `POST /triage`)
- `link_pr_to_annotation` (ergonomic resolve + PR link shorthand)

## Configuration

Two env vars:

| Var | Required? | Default | Notes |
|---|---|---|---|
| `TEB_API_TOKEN` | YES | none | A member token from your worker's `MEMBER_TOKENS` env var |
| `TEB_API_URL` | no | `https://eats.travisfixes.com` | Override for self-hosted workers |

## Install in Claude Code

```bash
claude mcp add teb npx @travisbreaks/travisEATSbugs-mcp
```

Then add the env vars to your shell profile (or use the `--env` flag).

## Install in Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "teb": {
      "command": "npx",
      "args": ["@travisbreaks/travisEATSbugs-mcp"],
      "env": {
        "TEB_API_TOKEN": "your-member-token",
        "TEB_API_URL": "https://eats.travisfixes.com"
      }
    }
  }
}
```

## Develop locally

```bash
pnpm install
pnpm --filter @travisbreaks/travisEATSbugs-mcp build
TEB_API_TOKEN=your-token node ./apps/mcp-server/dist/index.js
```

The server runs over stdio. To smoke-test, use the MCP inspector: `npx @modelcontextprotocol/inspector node ./apps/mcp-server/dist/index.js`.

## Run tests

```bash
pnpm --filter @travisbreaks/travisEATSbugs-mcp test
```

The smoke tests run against `MemoryAdapter` in-process; no network calls. To run a true end-to-end smoke against the canonical worker, see the runbook in `docs/dev-workflow.md`.

## Tier

Apache 2.0, self-hostable, free OSS. The paid tier (`teb-cloud`) adds AI triage at scale, multi-tenant routing, and the closed-loop inbox UI. The MCP server itself is OSS.

## License

Apache 2.0. See [LICENSE](../../LICENSE).
