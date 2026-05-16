/**
 * W3C Web Annotation Data Model conversion (v0.5 finalization).
 *
 * Spec: https://www.w3.org/TR/annotation-model/
 *
 * Our internal Annotation shape (`types.ts`) is purpose-built for the
 * triage inbox: discriminated anchor union, resolution / overlap state,
 * triage result, severity. The W3C model is more general (commenting,
 * tagging, linking on arbitrary IRIs). This module is the bridge:
 *
 *   - `toW3C(a)` produces a valid W3C Annotation JSON-LD shape. Our
 *     non-spec fields (state, severity, resolvedPR, triage, etc.)
 *     hang off a `teb:` extension namespace so a consumer that doesn't
 *     know about us can still parse the document as a stock W3C
 *     annotation, and a consumer that does (us) can round-trip cleanly.
 *
 *   - `fromW3C(doc)` reads a W3C annotation back into our internal
 *     shape. Round-trips with toW3C produce a structurally equal
 *     annotation (tested below). Anchors recover from the selector
 *     array: CssSelector -> selector, XPathSelector -> xpath,
 *     TextQuoteSelector -> textQuote, FragmentSelector(xywh=) -> viewport
 *     for route mode, or x/y for spatial.
 *
 *   - `W3C_CONTEXT` and `TEB_NAMESPACE` are exported so hosts that want
 *     to compose their own JSON-LD context can reference our extension
 *     vocabulary explicitly.
 *
 * This module is intentionally pure: no DOM, no I/O, just structural
 * conversion. Adapters that want to expose a W3C-shaped HTTP endpoint
 * (e.g. for federation with hypothes.is) compose this on top of the
 * existing CRUD surface.
 */

import type {
  Annotation,
  AnnotationAnchor,
  AuthorRef,
  TextQuote,
  TriageResult,
  Viewport,
} from './types'

export const W3C_CONTEXT = 'http://www.w3.org/ns/anno.jsonld'
export const TEB_NAMESPACE = 'https://travisEATSbugs.com/ns#'

export type W3CTextualBody = {
  type: 'TextualBody'
  value: string
  format?: string
  language?: string
}

export type W3CCssSelector = { type: 'CssSelector'; value: string }
export type W3CXPathSelector = { type: 'XPathSelector'; value: string }
export type W3CTextQuoteSelector = {
  type: 'TextQuoteSelector'
  exact: string
  prefix?: string
  suffix?: string
}
export type W3CFragmentSelector = {
  type: 'FragmentSelector'
  value: string
  conformsTo?: string
}
export type W3CSelector =
  | W3CCssSelector
  | W3CXPathSelector
  | W3CTextQuoteSelector
  | W3CFragmentSelector

export type W3CSpecificResource = {
  source: string
  selector?: W3CSelector | W3CSelector[]
}

export type W3CCreator = {
  id: string
  type: 'Person'
  name: string
  /** Non-spec extension: avatar URL when present. */
  'teb:avatarUrl'?: string
}

/**
 * Our extension block. Stored under the `teb:` prefix so a spec
 * consumer ignores it cleanly while a TEB consumer round-trips it.
 */
export type TebExtension = {
  /** Open / resolved lifecycle state. */
  state: 'open' | 'resolved'
  /** Optional manual severity tag. */
  severity?: 'low' | 'medium' | 'high'
  /** Resolution provenance (Pivotal mig 045 lineage). */
  resolvedPR?: number
  resolvedAt?: number
  resolvedBy?: string
  resolutionNote?: string
  /** Overlap tracking (Pivotal mig 058 lineage). */
  relatedIds?: string[]
  dupOf?: string
  /** AI triage onCreate hook result. */
  triage?: TriageResult
  /** Captured screenshot. */
  screenshot?: { url: string; w: number; h: number }
  /** Spatial anchor surface kind, when target is a spatial pin. */
  surfaceKind?: 'screenshot' | 'canvas'
  /** Surface IRI for spatial pins (the unscaled source identifier). */
  surfaceId?: string
}

export type W3CAnnotation = {
  '@context': typeof W3C_CONTEXT
  id: string
  type: 'Annotation'
  motivation: 'commenting' | ['commenting', 'assessing']
  created: string
  modified: string
  creator: W3CCreator
  body: W3CTextualBody[]
  target: W3CSpecificResource
  'teb:ext': TebExtension
}

/**
 * Convert an internal Annotation to a spec-valid W3C JSON-LD document.
 * Spec consumers (hypothes.is, Recogito, Pundit) can parse this as a
 * standard annotation: only the `teb:ext` block is ours, and it's safe
 * to drop without losing the body / target / creator / motivation.
 */
export function toW3C(a: Annotation): W3CAnnotation {
  const motivation: W3CAnnotation['motivation'] =
    a.severity === 'high' ? ['commenting', 'assessing'] : 'commenting'

  const body: W3CTextualBody[] = [
    {
      type: 'TextualBody',
      value: a.body,
      format: 'text/plain',
    },
  ]

  const target = anchorToTarget(a.anchor)

  const creator: W3CCreator = {
    id: idIRI(a.author.id, 'author'),
    type: 'Person',
    name: a.author.display,
    ...(a.author.avatarUrl ? { 'teb:avatarUrl': a.author.avatarUrl } : {}),
  }

  const ext: TebExtension = { state: a.state }
  if (a.severity) ext.severity = a.severity
  if (a.resolvedPR !== undefined) ext.resolvedPR = a.resolvedPR
  if (a.resolvedAt !== undefined) ext.resolvedAt = a.resolvedAt
  if (a.resolvedBy) ext.resolvedBy = a.resolvedBy
  if (a.resolutionNote) ext.resolutionNote = a.resolutionNote
  if (a.relatedIds && a.relatedIds.length > 0) ext.relatedIds = a.relatedIds
  if (a.dupOf) ext.dupOf = a.dupOf
  if (a.triage) ext.triage = a.triage
  if (a.screenshot) ext.screenshot = a.screenshot
  if (a.anchor.mode === 'spatial') {
    ext.surfaceKind = a.anchor.surface
    ext.surfaceId = a.anchor.surfaceId
  }

  return {
    '@context': W3C_CONTEXT,
    id: idIRI(a.id, 'annotation'),
    type: 'Annotation',
    motivation,
    created: new Date(a.createdAt).toISOString(),
    modified: new Date(a.modifiedAt).toISOString(),
    creator,
    body,
    target,
    'teb:ext': ext,
  }
}

/**
 * Convert a W3C annotation back into our internal shape. The companion
 * to toW3C: round-trip preserves all fields. Lossy when reading
 * external (non-TEB) annotations: we only recover what maps cleanly to
 * our model. Documents without a `teb:ext` block default to state='open'
 * and lose resolution / severity / triage history.
 */
export function fromW3C(doc: W3CAnnotation): Annotation {
  const ext: TebExtension = doc['teb:ext'] ?? { state: 'open' }
  const author = creatorToAuthor(doc.creator)
  const bodyText = doc.body.find((b) => b.type === 'TextualBody')?.value ?? ''
  const anchor = targetToAnchor(doc.target, ext)

  const out: Annotation = {
    id: stripIRI(doc.id, 'annotation'),
    anchor,
    body: bodyText,
    author,
    createdAt: Date.parse(doc.created),
    modifiedAt: Date.parse(doc.modified),
    state: ext.state,
  }
  if (ext.severity) out.severity = ext.severity
  if (ext.resolvedPR !== undefined) out.resolvedPR = ext.resolvedPR
  if (ext.resolvedAt !== undefined) out.resolvedAt = ext.resolvedAt
  if (ext.resolvedBy) out.resolvedBy = ext.resolvedBy
  if (ext.resolutionNote) out.resolutionNote = ext.resolutionNote
  if (ext.relatedIds && ext.relatedIds.length > 0) out.relatedIds = ext.relatedIds
  if (ext.dupOf) out.dupOf = ext.dupOf
  if (ext.triage) out.triage = ext.triage
  if (ext.screenshot) out.screenshot = ext.screenshot
  return out
}

function anchorToTarget(anchor: AnnotationAnchor): W3CSpecificResource {
  if (anchor.mode === 'route') {
    const selectors: W3CSelector[] = []
    if (anchor.selector) selectors.push({ type: 'CssSelector', value: anchor.selector })
    if (anchor.xpath) selectors.push({ type: 'XPathSelector', value: anchor.xpath })
    if (anchor.textQuote) selectors.push(textQuoteToSelector(anchor.textQuote))
    if (anchor.viewport) selectors.push(viewportToSelector(anchor.viewport))
    const target: W3CSpecificResource = { source: anchor.path }
    if (selectors.length === 1 && selectors[0]) target.selector = selectors[0]
    else if (selectors.length > 1) target.selector = selectors
    return target
  }
  // Spatial: encode x/y as percent FragmentSelector per Media Fragments.
  // `xywh=percent:x,y,0,0` is the canonical zero-extent (point) form.
  return {
    source: anchor.surfaceId,
    selector: {
      type: 'FragmentSelector',
      value: `xywh=percent:${anchor.x},${anchor.y},0,0`,
      conformsTo: 'http://www.w3.org/TR/media-frags/',
    },
  }
}

function textQuoteToSelector(q: TextQuote): W3CTextQuoteSelector {
  const sel: W3CTextQuoteSelector = { type: 'TextQuoteSelector', exact: q.exact }
  if (q.prefix !== undefined && q.prefix !== '') sel.prefix = q.prefix
  if (q.suffix !== undefined && q.suffix !== '') sel.suffix = q.suffix
  return sel
}

function viewportToSelector(v: Viewport): W3CFragmentSelector {
  return {
    type: 'FragmentSelector',
    value: `xywh=${v.x},${v.y},${v.w},${v.h}`,
    conformsTo: 'http://www.w3.org/TR/media-frags/',
  }
}

function targetToAnchor(target: W3CSpecificResource, ext: TebExtension): AnnotationAnchor {
  const selectors = normalizeSelectors(target.selector)
  // Spatial detection: any FragmentSelector with the percent prefix indicates
  // a spatial pin (vs. a viewport region which uses pixel xywh).
  const fragment = selectors.find(
    (s): s is W3CFragmentSelector =>
      s.type === 'FragmentSelector' && s.value.startsWith('xywh=percent:'),
  )
  if (fragment) {
    const parsed = parseFragmentXywhPercent(fragment.value)
    return {
      mode: 'spatial',
      surface: ext.surfaceKind ?? 'canvas',
      surfaceId: ext.surfaceId ?? target.source,
      x: parsed?.x ?? 0,
      y: parsed?.y ?? 0,
    }
  }
  // Route mode.
  const css = selectors.find((s): s is W3CCssSelector => s.type === 'CssSelector')
  const xpath = selectors.find((s): s is W3CXPathSelector => s.type === 'XPathSelector')
  const textQuote = selectors.find((s): s is W3CTextQuoteSelector => s.type === 'TextQuoteSelector')
  const viewportSel = selectors.find(
    (s): s is W3CFragmentSelector =>
      s.type === 'FragmentSelector' && !s.value.startsWith('xywh=percent:'),
  )
  const anchor: AnnotationAnchor = { mode: 'route', path: target.source }
  if (css) anchor.selector = css.value
  if (xpath) anchor.xpath = xpath.value
  if (textQuote) {
    const tq: TextQuote = { exact: textQuote.exact }
    if (textQuote.prefix) tq.prefix = textQuote.prefix
    if (textQuote.suffix) tq.suffix = textQuote.suffix
    anchor.textQuote = tq
  }
  if (viewportSel) {
    const parsed = parseFragmentXywhPixels(viewportSel.value)
    if (parsed) anchor.viewport = parsed
  }
  return anchor
}

function normalizeSelectors(sel: W3CSpecificResource['selector']): W3CSelector[] {
  if (!sel) return []
  return Array.isArray(sel) ? sel : [sel]
}

function parseFragmentXywhPercent(value: string): { x: number; y: number } | null {
  const m = /^xywh=percent:([\d.\-]+),([\d.\-]+),/.exec(value)
  if (!m || !m[1] || !m[2]) return null
  const x = Number.parseFloat(m[1])
  const y = Number.parseFloat(m[2])
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

function parseFragmentXywhPixels(value: string): Viewport | null {
  const m = /^xywh=([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+)/.exec(value)
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) return null
  const x = Number.parseFloat(m[1])
  const y = Number.parseFloat(m[2])
  const w = Number.parseFloat(m[3])
  const h = Number.parseFloat(m[4])
  if ([x, y, w, h].some(Number.isNaN)) return null
  return { x, y, w, h }
}

function creatorToAuthor(creator: W3CCreator): AuthorRef {
  const out: AuthorRef = {
    id: stripIRI(creator.id, 'author'),
    display: creator.name,
  }
  const avatar = creator['teb:avatarUrl']
  if (avatar) out.avatarUrl = avatar
  return out
}

function idIRI(id: string, kind: 'annotation' | 'author'): string {
  // Already a URI: keep as-is to preserve federation IDs.
  if (/^[a-z]+:/.test(id)) return id
  return `urn:teb:${kind}:${id}`
}

function stripIRI(iri: string, kind: 'annotation' | 'author'): string {
  const prefix = `urn:teb:${kind}:`
  return iri.startsWith(prefix) ? iri.slice(prefix.length) : iri
}
