/**
 * Tests for the W3C Web Annotation Data Model conversion.
 *
 * Spec: https://www.w3.org/TR/annotation-model/
 *
 * Covers:
 *  - Round-trip Annotation -> W3CAnnotation -> Annotation preserves all fields.
 *  - Required W3C field names are present (id, type, motivation, body, target,
 *    creator, created, modified, @context).
 *  - Selector union maps correctly: CssSelector / XPathSelector /
 *    TextQuoteSelector / FragmentSelector with both percent (spatial) and
 *    pixel (viewport) xywh values.
 *  - The `teb:ext` extension block carries state + severity + triage +
 *    resolution / overlap fields and survives a round-trip.
 *  - fromW3C tolerates spec-only annotations (no teb:ext): defaults state to
 *    'open' and drops the rest of our domain fields cleanly.
 */

import { describe, expect, it } from 'vitest'
import type { Annotation } from './types'
import { W3C_CONTEXT, fromW3C, toW3C } from './w3c'

function fixedAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'local-1700000000000-abc',
    anchor: {
      mode: 'route',
      path: '/about',
      selector: 'h1.hero',
      xpath: '/html/body/main/h1',
      textQuote: { exact: 'Click', prefix: 'You can ', suffix: ' to start' },
      viewport: { x: 10, y: 20, w: 200, h: 80 },
    },
    body: 'This headline is buried.',
    author: { id: 'cole', display: 'Cole', avatarUrl: 'https://example/avatar.png' },
    createdAt: 1700000000000,
    modifiedAt: 1700000001000,
    state: 'open',
    severity: 'high',
    ...overrides,
  }
}

describe('toW3C', () => {
  it('emits a spec-shaped annotation with the canonical context', () => {
    const w3c = toW3C(fixedAnnotation())
    expect(w3c['@context']).toBe(W3C_CONTEXT)
    expect(w3c.type).toBe('Annotation')
    expect(w3c.id).toMatch(/^urn:teb:annotation:/)
    expect(w3c.created).toBe('2023-11-14T22:13:20.000Z')
    expect(w3c.modified).toBe('2023-11-14T22:13:21.000Z')
  })

  it('elevates severity=high to a co-motivation of assessing', () => {
    const w3c = toW3C(fixedAnnotation({ severity: 'high' }))
    expect(w3c.motivation).toEqual(['commenting', 'assessing'])
  })

  it('keeps motivation=commenting for severity below high', () => {
    expect(toW3C(fixedAnnotation({ severity: 'low' })).motivation).toBe('commenting')
    expect(toW3C(fixedAnnotation({ severity: 'medium' })).motivation).toBe('commenting')
    const { severity: _omitted, ...noSeverity } = fixedAnnotation()
    void _omitted
    expect(toW3C(noSeverity as Annotation).motivation).toBe('commenting')
  })

  it('emits body as a TextualBody with text/plain format', () => {
    const w3c = toW3C(fixedAnnotation())
    expect(w3c.body).toHaveLength(1)
    expect(w3c.body[0]).toEqual({
      type: 'TextualBody',
      value: 'This headline is buried.',
      format: 'text/plain',
    })
  })

  it('maps creator with avatarUrl into the teb: extension', () => {
    const w3c = toW3C(fixedAnnotation())
    expect(w3c.creator.id).toBe('urn:teb:author:cole')
    expect(w3c.creator.type).toBe('Person')
    expect(w3c.creator.name).toBe('Cole')
    expect(w3c.creator['teb:avatarUrl']).toBe('https://example/avatar.png')
  })

  it('emits route-mode targets with the full selector array', () => {
    const w3c = toW3C(fixedAnnotation())
    expect(w3c.target.source).toBe('/about')
    expect(Array.isArray(w3c.target.selector)).toBe(true)
    const selectors = Array.isArray(w3c.target.selector)
      ? w3c.target.selector
      : w3c.target.selector
        ? [w3c.target.selector]
        : []
    const types = selectors.map((s) => s.type)
    expect(types).toEqual(['CssSelector', 'XPathSelector', 'TextQuoteSelector', 'FragmentSelector'])
  })

  it('emits route-mode with a single selector when only one applies', () => {
    const w3c = toW3C(
      fixedAnnotation({
        anchor: { mode: 'route', path: '/', selector: 'h1' },
      }),
    )
    expect(Array.isArray(w3c.target.selector)).toBe(false)
    expect(w3c.target.selector).toEqual({ type: 'CssSelector', value: 'h1' })
  })

  it('emits spatial-mode targets as a FragmentSelector with percent xywh', () => {
    const w3c = toW3C(
      fixedAnnotation({
        anchor: {
          mode: 'spatial',
          surface: 'screenshot',
          surfaceId: 'mockup-v2',
          x: 42.5,
          y: 30,
        },
      }),
    )
    expect(w3c.target.source).toBe('mockup-v2')
    expect(w3c.target.selector).toEqual({
      type: 'FragmentSelector',
      value: 'xywh=percent:42.5,30,0,0',
      conformsTo: 'http://www.w3.org/TR/media-frags/',
    })
    expect(w3c['teb:ext'].surfaceKind).toBe('screenshot')
  })

  it('packs state, severity, resolution, overlap, triage, and screenshot into teb:ext', () => {
    const w3c = toW3C(
      fixedAnnotation({
        state: 'resolved',
        severity: 'medium',
        resolvedPR: 142,
        resolvedAt: 1700000005000,
        resolvedBy: 'cole',
        resolutionNote: 'shipped',
        relatedIds: ['other-1', 'other-2'],
        dupOf: 'other-3',
        triage: {
          severity: 'medium',
          category: 'copy',
          rationale: 'word choice',
        },
        screenshot: { url: 'https://r2/cap.png', w: 800, h: 600 },
      }),
    )
    expect(w3c['teb:ext']).toEqual({
      state: 'resolved',
      severity: 'medium',
      resolvedPR: 142,
      resolvedAt: 1700000005000,
      resolvedBy: 'cole',
      resolutionNote: 'shipped',
      relatedIds: ['other-1', 'other-2'],
      dupOf: 'other-3',
      triage: {
        severity: 'medium',
        category: 'copy',
        rationale: 'word choice',
      },
      screenshot: { url: 'https://r2/cap.png', w: 800, h: 600 },
    })
  })
})

describe('fromW3C', () => {
  it('round-trips a full route-mode annotation losslessly', () => {
    const original = fixedAnnotation({
      resolvedPR: 142,
      resolvedAt: 1700000005000,
      resolvedBy: 'cole',
      resolutionNote: 'shipped',
      relatedIds: ['x', 'y'],
      dupOf: 'z',
      triage: {
        severity: 'high',
        category: 'a11y',
        suggestedAssignee: 'cole',
        rationale: 'contrast',
        triagedAt: 1700000003000,
      },
      screenshot: { url: 'data:foo', w: 100, h: 80 },
    })
    const recovered = fromW3C(toW3C(original))
    expect(recovered).toEqual(original)
  })

  it('round-trips a spatial-mode annotation losslessly', () => {
    const original = fixedAnnotation({
      anchor: {
        mode: 'spatial',
        surface: 'canvas',
        surfaceId: 'demo-1',
        x: 12.25,
        y: 88.5,
      },
    })
    const recovered = fromW3C(toW3C(original))
    expect(recovered).toEqual(original)
  })

  it('round-trips an annotation with no resolution / overlap / triage fields', () => {
    const original: Annotation = {
      id: 'local-1700000000000-abc',
      anchor: { mode: 'route', path: '/about', selector: 'h1.hero' },
      body: 'plain text',
      author: { id: 'cole', display: 'Cole' },
      createdAt: 1700000000000,
      modifiedAt: 1700000001000,
      state: 'open',
    }
    const recovered = fromW3C(toW3C(original))
    expect(recovered).toEqual(original)
  })

  it('tolerates a spec-only annotation lacking teb:ext (defaults state=open)', () => {
    const specOnly = {
      '@context': W3C_CONTEXT,
      id: 'http://example.org/anno/5',
      type: 'Annotation' as const,
      motivation: 'commenting' as const,
      created: '2023-11-14T22:13:20.000Z',
      modified: '2023-11-14T22:13:20.000Z',
      creator: {
        id: 'http://example.org/users/cole',
        type: 'Person' as const,
        name: 'Cole',
      },
      body: [{ type: 'TextualBody' as const, value: 'hello', format: 'text/plain' }],
      target: {
        source: '/about',
        selector: { type: 'CssSelector' as const, value: 'h1' },
      },
    }
    // biome-ignore lint/suspicious/noExplicitAny: testing pre-extension shape
    const recovered = fromW3C(specOnly as any)
    expect(recovered.state).toBe('open')
    expect(recovered.id).toBe('http://example.org/anno/5')
    expect(recovered.author.id).toBe('http://example.org/users/cole')
    expect(recovered.body).toBe('hello')
    if (recovered.anchor.mode !== 'route') throw new Error('expected route')
    expect(recovered.anchor.selector).toBe('h1')
  })

  it('preserves an absolute IRI id verbatim (does not wrap with urn:teb:)', () => {
    const w3c = toW3C(fixedAnnotation({ id: 'https://acme.test/anno/42' }))
    expect(w3c.id).toBe('https://acme.test/anno/42')
    const recovered = fromW3C(w3c)
    expect(recovered.id).toBe('https://acme.test/anno/42')
  })

  it('recovers a viewport from a pixel FragmentSelector', () => {
    const w3c = toW3C(
      fixedAnnotation({
        anchor: {
          mode: 'route',
          path: '/',
          viewport: { x: 10, y: 20, w: 300, h: 80 },
        },
      }),
    )
    const recovered = fromW3C(w3c)
    if (recovered.anchor.mode !== 'route') throw new Error('expected route')
    expect(recovered.anchor.viewport).toEqual({ x: 10, y: 20, w: 300, h: 80 })
  })

  it('recovers spatial x/y from a percent FragmentSelector', () => {
    const w3c = toW3C(
      fixedAnnotation({
        anchor: { mode: 'spatial', surface: 'canvas', surfaceId: 's', x: 7, y: 33.5 },
      }),
    )
    const recovered = fromW3C(w3c)
    if (recovered.anchor.mode !== 'spatial') throw new Error('expected spatial')
    expect(recovered.anchor.x).toBe(7)
    expect(recovered.anchor.y).toBe(33.5)
  })
})
