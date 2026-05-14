/**
 * Render SVGs in brand/concepts/recraft/ to PNG previews at multiple sizes.
 * Used after bake-off to enable visual comparison in Claude Code.
 *
 * Run with: pnpm preview
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const CONCEPTS_DIR = join(import.meta.dirname, '..', 'brand', 'concepts', 'recraft')
const SIZES = [64, 128, 256, 512]

function renderAt(svgString: string, width: number): Buffer {
  const r = new Resvg(svgString, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(255,255,255,0)',
  })
  return Buffer.from(r.render().asPng())
}

function main() {
  let svgs: string[]
  try {
    svgs = readdirSync(CONCEPTS_DIR).filter((f) => f.endsWith('.svg'))
  } catch {
    console.error(`No concepts dir at ${CONCEPTS_DIR}. Run pnpm bake-off first.`)
    process.exit(1)
  }
  if (svgs.length === 0) {
    console.error('No SVGs found. Run pnpm bake-off first.')
    process.exit(1)
  }

  for (const svgName of svgs) {
    const svgPath = join(CONCEPTS_DIR, svgName)
    const svg = readFileSync(svgPath, 'utf8')
    const base = svgName.replace(/\.svg$/, '')
    for (const size of SIZES) {
      const png = renderAt(svg, size)
      const out = join(CONCEPTS_DIR, `${base}-${size}.png`)
      writeFileSync(out, png)
      console.log(`  ${base}-${size}.png`)
    }
  }
  console.log(`\nDone. ${svgs.length} concepts rendered at ${SIZES.length} sizes each.`)
}

main()
