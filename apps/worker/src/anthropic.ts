/**
 * Anthropic API call for AI triage (v0.5 onCreate hook).
 *
 * Uses tool-use forced output so Claude returns a structurally valid
 * `TriageResult` without us needing to parse free-form prose. The tool
 * never actually runs; we just read the model's `input` payload and
 * return it. Tool-use is the recommended Anthropic pattern for
 * structured output as of model family 4.x.
 *
 * Design notes:
 *  - The model id is configurable via env (`ANTHROPIC_MODEL`), defaulting
 *    to `claude-sonnet-4-6` per the agent SDK guidance for new builds.
 *  - The route is OPT-IN at the env level: if `ANTHROPIC_API_KEY` is
 *    unset, the route returns 503 and the widget's httpTriage swallows
 *    the failure so the create path remains unblocked.
 *  - We pass the annotation body + anchor metadata + (optionally) the
 *    screenshot data URL. Screenshots can be very large; the caller
 *    decides whether to include them.
 *  - We deliberately do NOT thread reporter PII to Claude beyond the
 *    annotation body itself; author info is stripped from the prompt.
 *
 * Failure modes:
 *  - Non-2xx from Anthropic, malformed response, or aborted fetch all
 *    return null. The route layer translates null -> 502.
 */

import type { Annotation, TriageResult } from '@travisbreaks/travisEATSbugs'

export type TriageInvokeOpts = {
  apiKey: string
  model?: string
  /** Max tokens for the tool-use response. Triage payloads are small
   * (well under 200 tokens) but we leave headroom for rationale strings. */
  maxTokens?: number
  /** Optional list of recently-seen annotations to help the model surface
   * `dupeOf` suggestions. Author info is stripped before sending. */
  recent?: Annotation[]
  /** Optional fetch override for tests / non-fetch environments. */
  fetch?: typeof fetch
  /** Abort the upstream call after this many ms. Default 7000 (the
   * widget's httpTriage default is 8000, so the worker should bail
   * earlier to allow CORS / JSON unwind time before the client gives up).
   */
  timeoutMs?: number
}

const TRIAGE_TOOL_SCHEMA = {
  name: 'submit_triage',
  description:
    'Classify a visual-feedback annotation. Always call this tool exactly once with your best judgement; never decline.',
  input_schema: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description:
          'low = polish / copy nit / nice-to-have. medium = noticeable bug or UX problem. high = broken flow, accessibility blocker, or data correctness issue.',
      },
      category: {
        type: 'string',
        description:
          'Short single-word or two-word label. Examples: copy, a11y, layout, perf, broken, polish, content, mobile.',
      },
      suggested_assignee: {
        type: 'string',
        description:
          'Optional. Only include if the annotation body explicitly mentions a person or system (e.g. "ask alex" -> "alex"). Never invent assignees.',
      },
      dupe_of: {
        type: 'string',
        description:
          'Optional. The id of a recent annotation this one duplicates, drawn from the `recent` list provided. Omit if no clear duplicate.',
      },
      rationale: {
        type: 'string',
        description: 'One short sentence on why you chose this severity and category.',
      },
    },
    required: ['severity', 'category', 'rationale'],
  },
} as const

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type AnthropicResponse = {
  content?: AnthropicContentBlock[]
  stop_reason?: string
}

function stripAuthor(annotation: Annotation): Omit<Annotation, 'author' | 'screenshot'> & {
  hasScreenshot: boolean
} {
  const { author: _author, screenshot, ...rest } = annotation
  void _author
  return { ...rest, hasScreenshot: !!screenshot }
}

function buildPrompt(annotation: Annotation, recent: Annotation[] | undefined): string {
  const sanitized = stripAuthor(annotation)
  const recentList = recent
    ? recent.map((a) => ({
        id: a.id,
        body: a.body,
        anchor: a.anchor,
        triage: a.triage,
      }))
    : []
  return [
    'Classify the visual-feedback annotation below by calling submit_triage exactly once.',
    '',
    'Annotation:',
    JSON.stringify(sanitized, null, 2),
    recentList.length > 0
      ? `\nRecent annotations (use to detect duplicates only):\n${JSON.stringify(recentList, null, 2)}`
      : '',
    '',
    'Rules:',
    '- Always call submit_triage. Never reply in prose.',
    '- Choose severity from {low, medium, high}.',
    '- Choose a short single-word or two-word category. Reuse existing categories from the recent list when one fits.',
    '- Include suggested_assignee ONLY if the annotation body mentions a specific person or system. Never invent.',
    '- Include dupe_of ONLY if the annotation is clearly the same as one in the recent list, citing its id.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function invokeTriage(
  annotation: Annotation,
  opts: TriageInvokeOpts,
): Promise<TriageResult | null> {
  const {
    apiKey,
    model = 'claude-sonnet-4-6',
    maxTokens = 512,
    recent,
    fetch: fetchImpl,
    timeoutMs = 7000,
  } = opts
  if (!apiKey) return null
  const doFetch: typeof fetch =
    fetchImpl ??
    (typeof fetch !== 'undefined'
      ? fetch.bind(globalThis)
      : ((() => Promise.reject(new Error('no fetch'))) as typeof fetch))
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl
    ? setTimeout(() => {
        ctrl.abort()
      }, timeoutMs)
    : null
  try {
    const res = await doFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        tools: [TRIAGE_TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'submit_triage' },
        messages: [{ role: 'user', content: buildPrompt(annotation, recent) }],
      }),
      signal: ctrl?.signal,
    })
    if (!res.ok) return null
    const payload = (await res.json()) as AnthropicResponse
    const toolBlock = payload.content?.find(
      (b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> =>
        b.type === 'tool_use' && b.name === 'submit_triage',
    )
    if (!toolBlock) return null
    return coerceToolInput(toolBlock.input)
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function coerceToolInput(input: Record<string, unknown>): TriageResult | null {
  const sev = input.severity
  if (sev !== 'low' && sev !== 'medium' && sev !== 'high') return null
  if (typeof input.category !== 'string' || input.category.length === 0) return null
  if (typeof input.rationale !== 'string' || input.rationale.length === 0) return null
  const out: TriageResult = {
    severity: sev,
    category: input.category,
    rationale: input.rationale,
  }
  if (typeof input.suggested_assignee === 'string' && input.suggested_assignee.length > 0) {
    out.suggestedAssignee = input.suggested_assignee
  }
  if (typeof input.dupe_of === 'string' && input.dupe_of.length > 0) {
    out.dupeOf = input.dupe_of
  }
  return out
}
