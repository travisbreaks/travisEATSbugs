/**
 * Recraft V3 SVG bake-off via Replicate API.
 *
 * Run with: pnpm bake-off
 *
 * Secret source: macOS Keychain entry `REPLICATE_API_TOKEN`, read via
 * `security find-generic-password`. Never written to disk, never logged.
 * Pattern documented in: memory/capabilities.md (Theoria keyholder section).
 *
 * Generates N concept SVGs for the travisEATSbugs logo, saves them to
 * brand/concepts/recraft/, and renders PNG previews via resvg-js for
 * side-by-side comparison with the pure-local pipeline output.
 *
 * Cost: $0.08 per generation. 4 default concepts = $0.32.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function readTokenFromKeychain(): string {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', 'REPLICATE_API_TOKEN', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const trimmed = out.trim()
    if (!trimmed) throw new Error('empty value')
    return trimmed
  } catch {
    console.error(
      'REPLICATE_API_TOKEN not found in macOS Keychain.\n' +
        'Store it once with:\n' +
        '  security add-generic-password -U -a "$USER" -s "REPLICATE_API_TOKEN" -w\n' +
        '(prompts for hidden input)\n',
    )
    process.exit(1)
  }
}

const TOKEN = readTokenFromKeychain()

const OUT_DIR = join(import.meta.dirname, '..', 'brand', 'concepts', 'recraft')
mkdirSync(OUT_DIR, { recursive: true })

const MODEL_VERSION = 'recraft-ai/recraft-v3-svg'

// Recraft V3 SVG style enum: any | engraving | line_art | line_circuit | linocut
// `any` lets the prompt drive aesthetic. `line_art` is the next best for clean logo work.

const PROMPTS: Array<{ name: string; prompt: string; style?: string }> = [
  {
    name: '01-stylized-mouth-bug',
    prompt:
      'A minimalist vector logo: an open stylized mouth with rectangular teeth, a small cartoon beetle inside between the teeth. Bold simple shapes, deep navy blue on white background, square composition, clean line art, app icon style, no text.',
    style: 'any',
  },
  {
    name: '02-geometric-mouth-bug',
    prompt:
      'A geometric vector logo: rounded square frame containing an open mouth with teeth, a beetle bug inside. Two-tone deep blue and white, flat design, modern brand identity for a developer feedback tool, no text, square aspect.',
    style: 'any',
  },
  {
    name: '03-line-art-mouth-bug',
    prompt:
      'A friendly cartoon line-art logo: a smiling mouth character with visible teeth holding a small beetle between two of the teeth. Single-stroke line illustration, navy on white, playful but professional, square logo composition, no text.',
    style: 'line_art',
  },
  {
    name: '04-icon-style-eat-bug',
    prompt:
      'Vector app icon: a stylized open mouth with a beetle in the center, rendered as a clean modern symbol. Single-color silhouette with one accent dot of color on the bug. Bold, simple, immediately recognizable at 32px. Square crop, no text.',
    style: 'any',
  },
]

const SECONDS_BETWEEN_CALLS = 12 // burst-of-1 throttle while account credit < $5

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[]
  error?: string
  urls: { get: string; cancel: string }
}

async function createPrediction(
  prompt: string,
  style?: string,
  attempt = 1,
): Promise<ReplicatePrediction> {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL_VERSION}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt,
        size: '1024x1024',
        style: style ?? 'any',
      },
    }),
  })
  if (res.status === 429 && attempt <= 3) {
    const body = await res.text()
    const retryMatch = body.match(/"retry_after":\s*(\d+)/)
    const wait = retryMatch?.[1] ? Number.parseInt(retryMatch[1], 10) + 1 : 12
    console.log(`    throttled, waiting ${wait}s (attempt ${attempt}/3)`)
    await new Promise((r) => setTimeout(r, wait * 1000))
    return createPrediction(prompt, style, attempt + 1)
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Replicate API ${res.status}: ${body}`)
  }
  return (await res.json()) as ReplicatePrediction
}

async function pollPrediction(getUrl: string): Promise<ReplicatePrediction> {
  while (true) {
    const res = await fetch(getUrl, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const pred = (await res.json()) as ReplicatePrediction
    if (pred.status === 'succeeded' || pred.status === 'failed' || pred.status === 'canceled') {
      return pred
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

async function downloadSvg(url: string, outPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(outPath, buf)
}

async function main() {
  const start = Date.now()
  console.log(
    `Starting bake-off: ${PROMPTS.length} concepts at $0.08 each = $${(PROMPTS.length * 0.08).toFixed(2)}\n`,
  )

  const results: Array<{ name: string; svg: string; png?: string; error?: string }> = []

  for (const [idx, { name, prompt, style }] of PROMPTS.entries()) {
    if (idx > 0) {
      console.log(`    (pacing ${SECONDS_BETWEEN_CALLS}s for rate limit)`)
      await new Promise((r) => setTimeout(r, SECONDS_BETWEEN_CALLS * 1000))
    }
    process.stdout.write(`  ${name}... `)
    try {
      let pred = await createPrediction(prompt, style)
      if (pred.status !== 'succeeded' && pred.status !== 'failed') {
        pred = await pollPrediction(pred.urls.get)
      }
      if (pred.status === 'failed' || !pred.output) {
        results.push({ name, svg: '', error: pred.error ?? 'unknown' })
        console.log(`failed: ${pred.error ?? 'unknown'}`)
        continue
      }
      const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output
      if (!outputUrl) {
        results.push({ name, svg: '', error: 'no output url' })
        console.log('failed: no output url')
        continue
      }
      const svgPath = join(OUT_DIR, `${name}.svg`)
      await downloadSvg(outputUrl, svgPath)
      results.push({ name, svg: svgPath })
      console.log(`ok -> ${svgPath}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ name, svg: '', error: msg })
      console.log(`error: ${msg}`)
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const ok = results.filter((r) => !r.error).length
  console.log(`\nDone in ${elapsed}s. ${ok}/${PROMPTS.length} succeeded. Files in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
