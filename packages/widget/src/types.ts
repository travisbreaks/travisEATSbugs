/**
 * Unified data model for travisEATSbugs / AnnotationWidget.
 *
 * Sources:
 * - docs/extraction-strategy-2026-05-15.md (the unified Annotation type)
 * - docs/pivotal-extraction-audit-2026-05-15.md (resolution + overlap + audit columns)
 * - docs/lions-share-pin-annotations-audit-2026-05-15.md (spatial anchor mode)
 *
 * Covers both Pivotal's route-based anchoring and Lion's Share's spatial pins
 * under one discriminated union. Resolution / overlap / thread / screenshot are
 * optional so v0 consumers can ignore them; the schema is forward-compatible
 * with Pivotal mig 043 + 045 + 058.
 */

export type AuthorRef = {
  id: string
  display: string
  avatarUrl?: string
}

export type TextQuote = {
  exact: string
  prefix?: string
  suffix?: string
}

export type Viewport = {
  x: number
  y: number
  w: number
  h: number
}

export type ThreadEntry = {
  id: string
  author: AuthorRef
  body: string
  createdAt: number
}

export type AnnotationAnchor =
  | {
      mode: 'route'
      path: string
      /** `@medv/finder` shortest unique CSS selector (or fallback chain). */
      selector?: string
      /** XPath expression (absolute, `/html/body/...`). Stable across class
       * churn that breaks CSS selectors, complementary to `selector`. */
      xpath?: string
      textQuote?: TextQuote
      viewport?: Viewport
    }
  | {
      mode: 'spatial'
      surface: 'screenshot' | 'canvas'
      surfaceId: string
      x: number
      y: number
    }

export type Annotation = {
  id: string
  anchor: AnnotationAnchor
  body: string
  author: AuthorRef
  createdAt: number
  modifiedAt: number
  state: 'open' | 'resolved'
  resolvedPR?: number
  resolvedAt?: number
  resolvedBy?: string
  resolutionNote?: string
  relatedIds?: string[]
  dupOf?: string
  severity?: 'low' | 'medium' | 'high'
  thread?: ThreadEntry[]
  screenshot?: { url: string; w: number; h: number }
}

/**
 * PATCH shapes mirror Pivotal's discriminated PATCH surface
 * (body edit | resolve | reopen | overlap-only). Never mix body + resolution
 * in the same patch.
 */
export type UpdatePatch =
  | { body: string }
  | {
      resolvedPR: number
      resolutionNote?: string
      relatedIds?: string[]
      dupOf?: string
    }
  | { resolvedPR: null }
  | { relatedIds?: string[]; dupOf?: string }

export type AnchorQuery = { mode: 'route'; path?: string } | { mode: 'spatial'; surfaceId?: string }

export type ListQuery = {
  anchor?: AnchorQuery
  state?: 'open' | 'resolved' | 'all'
}

export type CreateInput = Pick<Annotation, 'anchor' | 'body'> & {
  severity?: Annotation['severity']
}
