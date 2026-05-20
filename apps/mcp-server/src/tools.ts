/**
 * MCP tool definitions for the travisEATSbugs server.
 *
 * Each tool wraps a method on the canonical HttpAdapter so the LLM agent
 * calling the server gets the same data shape the widget consumes. Tool
 * input schemas use JSON Schema directly (no zod dep to keep the bundle
 * tight); the SDK validates per the schema before invoking the handler.
 *
 * Initial scope (0.0.10-alpha.0):
 *   - list_annotations: filter by route path + state
 *   - get_annotation: by id
 *   - resolve_annotation: mark resolved with PR + optional note
 *   - reopen_annotation: clear resolution
 *
 * Deferred for next release:
 *   - bulk_create_annotations (calls POST /annotations/bulk from 0.0.9)
 *   - triage_annotation (calls POST /triage; member-only)
 *   - link_pr_to_annotation (resolution + PR link in one call; subset of
 *     resolve_annotation but ergonomic shorthand for agents)
 */

import type { Annotation, ApiAdapter } from '@travisbreaks/travisEATSbugs'

export type ToolDef = {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties: false
  }
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_annotations',
    description:
      'List feedback annotations. Optionally filter by route path (e.g. "/bookings/123") and/or state (open / resolved / all). Returns an array of Annotation objects with full metadata (body, anchor, author, kind, state, resolution status, environment, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional route path filter, e.g. "/" or "/bookings/123".',
        },
        state: {
          type: 'string',
          enum: ['open', 'resolved', 'all'],
          description: 'Optional state filter. Defaults to "all" when omitted.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_annotation',
    description:
      'Fetch a single annotation by id. Returns the full Annotation object with metadata, or an error if not found.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Annotation id (e.g. "local-..." or worker-issued id).',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_annotation',
    description:
      'Mark an annotation as resolved by linking it to a shipped PR. Sets resolvedPR, resolvedAt, resolvedBy on the annotation. Optionally include a free-form resolutionNote.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Annotation id to resolve.' },
        resolvedPR: { type: 'number', description: 'GitHub PR number that shipped the fix.' },
        resolutionNote: {
          type: 'string',
          description: 'Optional free-form context (e.g. "shipped in canary, awaiting confirm").',
        },
      },
      required: ['id', 'resolvedPR'],
      additionalProperties: false,
    },
  },
  {
    name: 'reopen_annotation',
    description:
      'Reopen a previously-resolved annotation. Clears resolvedPR / resolvedAt / resolvedBy / resolutionNote and sets state back to "open".',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Annotation id to reopen.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

export type ToolName =
  | 'list_annotations'
  | 'get_annotation'
  | 'resolve_annotation'
  | 'reopen_annotation'

export type ToolHandlerArgs = {
  list_annotations: { path?: string; state?: 'open' | 'resolved' | 'all' }
  get_annotation: { id: string }
  resolve_annotation: { id: string; resolvedPR: number; resolutionNote?: string }
  reopen_annotation: { id: string }
}

export type ToolHandlers = {
  [K in ToolName]: (
    api: ApiAdapter,
    args: ToolHandlerArgs[K],
  ) => Promise<{ content: { type: 'text'; text: string }[] }>
}

function asText(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export const handlers: ToolHandlers = {
  async list_annotations(api, args) {
    const result = await api.list({
      ...(args.path !== undefined ? { anchor: { mode: 'route' as const, path: args.path } } : {}),
      ...(args.state ? { state: args.state } : {}),
    })
    return asText(result)
  },
  async get_annotation(api, args) {
    const all = await api.list({ state: 'all' })
    const match = all.find((a: Annotation) => a.id === args.id)
    if (!match) {
      throw new Error(`annotation not found: ${args.id}`)
    }
    return asText(match)
  },
  async resolve_annotation(api, args) {
    const patch = {
      resolvedPR: args.resolvedPR,
      ...(args.resolutionNote ? { resolutionNote: args.resolutionNote } : {}),
    }
    const updated = await api.update(args.id, patch)
    return asText(updated)
  },
  async reopen_annotation(api, args) {
    const updated = await api.update(args.id, { resolvedPR: null })
    return asText(updated)
  },
}
