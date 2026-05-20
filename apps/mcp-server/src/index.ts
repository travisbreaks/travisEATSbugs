#!/usr/bin/env node
/**
 * travisEATSbugs MCP server entry point.
 *
 * Runs over stdio (the default transport for `claude-code` and most
 * MCP clients). Exposes feedback-annotation tools so an LLM agent can
 * list, inspect, resolve, and reopen notes against the canonical
 * `eats.travisfixes.com` worker.
 *
 * Configuration via env vars:
 *   - TEB_API_TOKEN (REQUIRED): a member token from the worker's
 *     MEMBER_TOKENS env var. Bearer-attached to every request.
 *   - TEB_API_URL (optional): defaults to `https://eats.travisfixes.com`.
 *     Override for self-hosted workers.
 *
 * Wire it into Claude Code via `claude mcp add teb npx
 * @travisbreaks/travisEATSbugs-mcp` plus the env vars in your shell
 * profile.
 *
 * BugHerd announced "BugHerd MCP coming soon" in their 2025 wrap-up.
 * TEB ships a working MCP server first as a public credibility marker
 * per the Phase 1 strategic plan.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { buildClient, loadConfigFromEnv } from './client.js'
import { TOOL_DEFS, type ToolHandlerArgs, type ToolName, handlers } from './tools.js'

const VERSION = '0.0.10-alpha.0'

async function main(): Promise<void> {
  const config = loadConfigFromEnv()
  const api = buildClient(config)

  const server = new Server(
    { name: 'travisEATSbugs', version: VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name as ToolName
    const args = (req.params.arguments ?? {}) as ToolHandlerArgs[ToolName]
    const handler = handlers[name]
    if (!handler) {
      throw new Error(`unknown tool: ${name}`)
    }
    try {
      // Each handler narrows its own args by tool name; the runtime
      // dispatcher just forwards. The MCP SDK validates against the
      // tool's inputSchema before this point.
      const dispatch = handler as (
        adapter: typeof api,
        a: unknown,
      ) => Promise<{ content: { type: 'text'; text: string }[] }>
      return await dispatch(api, args)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'tool_invocation_failed'
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${message}` }],
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server now runs over stdio until the client disconnects.
}

main().catch((err) => {
  console.error('teb-mcp fatal:', err)
  process.exit(1)
})
