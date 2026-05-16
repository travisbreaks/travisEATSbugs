#!/usr/bin/env node
/**
 * smoke-triage.mjs
 *
 * One-shot smoke test for the v0.5 AI triage onCreate hook. Exercises
 * the real Anthropic API (tool-use forced structured output) with a
 * sample annotation + a "recent" list, then prints the structured
 * TriageResult. Use this to verify the model + prompt + tool schema
 * work together before pointing the live worker at production.
 *
 * Standalone so it runs under plain `node` (no transpiler needed). Keeps
 * the request shape in lockstep with apps/worker/src/anthropic.ts; if
 * one moves, the other should too.
 *
 * Usage:
 *
 *   # from a keychain entry (preferred):
 *   ANTHROPIC_API_KEY=$(keychain-get TRAVISEATSBUGS_ANTHROPIC_API_KEY) \
 *     node scripts/smoke-triage.mjs
 *
 *   # or from an ambient env (less safe; ends up in shell history):
 *   ANTHROPIC_API_KEY=sk-... node scripts/smoke-triage.mjs
 *
 *   # optional: override the model
 *   ANTHROPIC_MODEL=claude-sonnet-4-6 ANTHROPIC_API_KEY=... \
 *     node scripts/smoke-triage.mjs
 *
 * Exits 0 on a valid TriageResult, 1 on null / malformed response.
 *
 * NOTE: this script costs a few cents per run. Don't loop on it in CI.
 */

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('[smoke-triage] ANTHROPIC_API_KEY not set; see usage in script header')
  process.exit(1)
}
const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const TRIAGE_TOOL = {
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
          'Optional. Only include if the annotation body explicitly mentions a person or system.',
      },
      dupe_of: {
        type: 'string',
        description:
          'Optional. The id of a recent annotation this one duplicates, drawn from the `recent` list. Omit if no clear duplicate.',
      },
      rationale: {
        type: 'string',
        description: 'One short sentence on why you chose this severity and category.',
      },
    },
    required: ['severity', 'category', 'rationale'],
  },
}

const sample = {
  id: 'local-smoke-1',
  anchor: {
    mode: 'route',
    path: '/install',
    selector: 'pre.code-block.npm-install',
    textQuote: { exact: 'npm i @travisbreaks/travisEATSbugs', prefix: '', suffix: '\n' },
  },
  body: 'The install snippet says npm but the rest of the docs use pnpm. Pick one.',
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  state: 'open',
}

const recent = [
  {
    id: 'local-recent-1',
    anchor: { mode: 'route', path: '/install' },
    body: 'The install section uses pnpm but the readme says npm. Fix one of them.',
    triage: { severity: 'low', category: 'copy', rationale: 'inconsistent package manager' },
  },
]

const prompt = [
  'Classify the visual-feedback annotation below by calling submit_triage exactly once.',
  '',
  'Annotation:',
  JSON.stringify(sample, null, 2),
  '',
  'Recent annotations (use to detect duplicates only):',
  JSON.stringify(recent, null, 2),
  '',
  'Rules:',
  '- Always call submit_triage. Never reply in prose.',
  '- Choose severity from {low, medium, high}.',
  '- Choose a short single-word or two-word category. Reuse existing categories from the recent list when one fits.',
  '- Include suggested_assignee ONLY if the annotation body mentions a specific person or system. Never invent.',
  '- Include dupe_of ONLY if the annotation is clearly the same as one in the recent list, citing its id.',
].join('\n')

console.log('[smoke-triage] model:', model)
console.log('[smoke-triage] annotation body:', sample.body)
console.log('[smoke-triage] recent count:', recent.length)
console.log('[smoke-triage] calling Anthropic...')

const start = Date.now()
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model,
    max_tokens: 512,
    tools: [TRIAGE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_triage' },
    messages: [{ role: 'user', content: prompt }],
  }),
})

if (!res.ok) {
  const text = await res.text()
  console.error(`[smoke-triage] FAIL: ${res.status} ${res.statusText}`)
  console.error(text)
  process.exit(1)
}

const payload = await res.json()
const tool = payload.content?.find((b) => b.type === 'tool_use' && b.name === 'submit_triage')
if (!tool) {
  console.error('[smoke-triage] FAIL: no submit_triage tool_use block in response')
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
}

const ms = Date.now() - start
const input = tool.input ?? {}
const result = {
  severity: input.severity,
  category: input.category,
  rationale: input.rationale,
  ...(input.suggested_assignee ? { suggestedAssignee: input.suggested_assignee } : {}),
  ...(input.dupe_of ? { dupeOf: input.dupe_of } : {}),
}

console.log(`[smoke-triage] OK (${ms}ms)`)
console.log(JSON.stringify(result, null, 2))

if (result.dupeOf === 'local-recent-1') {
  console.log('[smoke-triage] dedup detection fired: cited local-recent-1 as the duplicate')
}
