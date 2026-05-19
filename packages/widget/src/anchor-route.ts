/**
 * Capture a route-mode anchor from a target element.
 *
 * Produces (the "triple-selector" + spatial extras from
 * docs/architecture.md §"Anchoring"):
 *   - path: normalized window.location.pathname
 *   - selector: `@medv/finder` shortest unique CSS selector if available;
 *     otherwise a minimal parent>child chain with nth-of-type, max depth 6
 *   - xpath: absolute XPath, e.g. /html/body/div[2]/p[1]. Stable across
 *     class churn that breaks CSS selectors; complementary, not
 *     redundant.
 *   - textQuote: 60-char exact + 16-char prefix + 16-char suffix from the
 *     element's parent textContent (W3C Web Annotation pattern)
 *   - viewport: getBoundingClientRect snapshot
 *
 * Pure function: no side effects.
 */

import { finder } from '@medv/finder'
import type { AnnotationAnchor, TextQuote, Viewport } from './types'

const MAX_DEPTH = 6
const EXACT_MAX = 60
const PREFIX_MAX = 16
const SUFFIX_MAX = 16

export function captureRouteAnchor(target: Element): AnnotationAnchor {
  const selector = generateSelector(target)
  const xpath = generateXPath(target)
  const viewport = getViewport(target)
  const textQuote = getTextQuote(target)
  return {
    mode: 'route',
    path: getNormalizedPath(),
    ...(selector ? { selector } : {}),
    ...(xpath ? { xpath } : {}),
    ...(textQuote ? { textQuote } : {}),
    ...(viewport ? { viewport } : {}),
  }
}

function getNormalizedPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.pathname || '/'
  if (raw === '/') return '/'
  return raw.replace(/\/+$/, '') || '/'
}

/**
 * Class names that look like Tailwind / atomic-CSS utilities. Picking
 * these for selectors gives wildly ambiguous matches (`.items-start`
 * matches dozens of nodes on a typical Pivotal page), which means
 * `document.querySelector(sel)` returns the wrong element on render and
 * pins anchor visually in the "wrong place". @medv/finder's `className`
 * predicate lets us veto these so finder falls back to tag + nth-of-type
 * + structural selectors that survive class churn.
 */
const TW_UTILITY_PREFIXES = [
  'p-',
  'pt-',
  'pb-',
  'pl-',
  'pr-',
  'px-',
  'py-',
  'm-',
  'mt-',
  'mb-',
  'ml-',
  'mr-',
  'mx-',
  'my-',
  'w-',
  'h-',
  'min-',
  'max-',
  'size-',
  'text-',
  'bg-',
  'border',
  'rounded',
  'shadow',
  'font-',
  'tracking-',
  'leading-',
  'tabular-',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'block',
  'inline',
  'inline-block',
  'hidden',
  'contents',
  'items-',
  'justify-',
  'self-',
  'place-',
  'content-',
  'gap-',
  'space-',
  'cursor-',
  'select-',
  'whitespace-',
  'overflow-',
  'truncate',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'static',
  'top-',
  'bottom-',
  'left-',
  'right-',
  'inset-',
  'z-',
  'opacity-',
  'ring-',
  'divide-',
  'transition',
  'duration-',
  'ease-',
  'delay-',
  'animate-',
  'uppercase',
  'lowercase',
  'capitalize',
  'normal-case',
  'group',
  'peer',
  'hover:',
  'focus:',
  'focus-visible:',
  'active:',
  'disabled:',
  'sm:',
  'md:',
  'lg:',
  'xl:',
  '2xl:',
  'dark:',
  'motion-',
]

function isUtilityClass(name: string): boolean {
  if (!name) return true
  // Arbitrary-value utilities like `min-h-[180px]` or `[var(--accent)]`.
  if (name.includes('[') || name.includes(']')) return true
  // Escaped colons survive in querySelector strings as `\:`; the unescaped
  // form here still contains the colon. Tailwind variant prefixes.
  if (name.includes(':') || name.includes('\\:')) return true
  // Single-letter utility names like `p` or `m` (rare; defensive).
  if (name.length <= 1) return true
  for (const prefix of TW_UTILITY_PREFIXES) {
    if (name === prefix) return true
    if (name.startsWith(prefix)) return true
  }
  return false
}

function generateSelector(target: Element): string | undefined {
  if (!(target instanceof Element)) return undefined
  try {
    return finder(target as HTMLElement, {
      // Veto class names that look like utility-class noise. With every
      // candidate vetoed, @medv/finder falls back to tagName + structural
      // position, which yields stable selectors on rebuilt DOM.
      className: (name) => !isUtilityClass(name),
      // Allow ids (often semantic) and data-* attrs (intentional).
      idName: (name) => Boolean(name) && !name.startsWith(':'),
      attr: (name, value) => {
        if (!name) return false
        if (name === 'id') return Boolean(value) && !value.startsWith(':')
        if (name.startsWith('data-')) return Boolean(value)
        if (name === 'aria-label') return Boolean(value)
        return false
      },
    })
  } catch {
    return fallbackSelector(target)
  }
}

function fallbackSelector(target: Element): string | undefined {
  const parts: string[] = []
  let el: Element | null = target
  let depth = 0
  while (el && depth < MAX_DEPTH) {
    const node: Element = el
    const id = (node as HTMLElement).id
    if (id) {
      parts.unshift(`#${cssEscape(id)}`)
      break
    }
    let part = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (parent) {
      const siblings: Element[] = Array.from(parent.children).filter(
        (c: Element) => c.tagName === node.tagName,
      )
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1
        part += `:nth-of-type(${idx})`
      }
    }
    parts.unshift(part)
    el = parent
    depth += 1
  }
  return parts.length > 0 ? parts.join(' > ') : undefined
}

function cssEscape(value: string): string {
  // Prefer the standard if available, otherwise hand-escape the common
  // selector-breaking chars. Shadow DOM exposes CSS.escape consistently.
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  if (g.CSS && typeof g.CSS.escape === 'function') {
    return g.CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
}

function getViewport(target: Element): Viewport | undefined {
  if (typeof target.getBoundingClientRect !== 'function') return undefined
  const r = target.getBoundingClientRect()
  if (!r) return undefined
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/**
 * Build an absolute XPath, e.g. `/html/body/div[2]/p[1]`.
 *
 * Walks from the target up to <html>, recording `tag[positional-index]`
 * for each step where the tag has multiple same-tag siblings. Drops the
 * positional index when the tag is unique under its parent (cleaner XPath
 * + identical match semantics).
 *
 * Stops if it hits a non-element parent (e.g. document, ShadowRoot) so
 * shadow-hosted elements get a partial XPath rooted at the shadow host's
 * subtree.
 */
function generateXPath(target: Element): string | undefined {
  if (!(target instanceof Element)) return undefined
  const segments: string[] = []
  let cursor: Element | null = target
  while (cursor && cursor.nodeType === 1 /* ELEMENT_NODE */) {
    const node: Element = cursor
    const tag = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (!parent) {
      segments.unshift(tag)
      break
    }
    const sameTagSiblings: Element[] = Array.from(parent.children).filter(
      (c: Element) => c.tagName === node.tagName,
    )
    if (sameTagSiblings.length === 1) {
      segments.unshift(tag)
    } else {
      const idx = sameTagSiblings.indexOf(node) + 1
      segments.unshift(`${tag}[${idx}]`)
    }
    cursor = parent
  }
  if (segments.length === 0) return undefined
  return `/${segments.join('/')}`
}

function getTextQuote(target: Element): TextQuote | undefined {
  const exactRaw = (target.textContent || '').replace(/\s+/g, ' ').trim()
  if (!exactRaw) return undefined
  const exact = exactRaw.slice(0, EXACT_MAX)
  const parent = target.parentElement
  if (!parent) return { exact }
  const parentText = (parent.textContent || '').replace(/\s+/g, ' ')
  const idx = parentText.indexOf(exact)
  if (idx === -1) return { exact }
  const prefix = parentText.slice(Math.max(0, idx - PREFIX_MAX), idx)
  const suffix = parentText.slice(idx + exact.length, idx + exact.length + SUFFIX_MAX)
  return {
    exact,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  }
}
