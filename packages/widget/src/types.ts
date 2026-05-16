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

/**
 * Output of an AI triage pass. Returned by a `TriageFn` and persisted on
 * the Annotation alongside the host's manual classification. The widget
 * stores the result verbatim; consumers can decide whether to display it
 * raw, surface it as a suggestion the reporter can accept/reject, or
 * promote `dupeOf` into the canonical `Annotation.dupOf` via a follow-up
 * overlap patch.
 *
 * Producers (typically a Cloudflare Worker route hitting Claude with
 * structured output) MUST return values from this exact shape; unknown
 * fields are dropped on serialization so the on-disk shape stays stable
 * across model upgrades.
 */
export type TriageResult = {
  severity: 'low' | 'medium' | 'high'
  category: string
  suggestedAssignee?: string
  dupeOf?: string
  /** Free-form rationale from the model. Optional and not indexed; useful
   * for debugging triage decisions in the inbox UI. Hosts that want a
   * compact on-disk shape can strip this before persisting. */
  rationale?: string
  /** Unix ms when triage ran. Adapters that don't set this default to the
   * adapter's `now()` at patch time. */
  triagedAt?: number
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
  /** Result of the most recent AI triage pass (v0.5 onCreate hook).
   * Optional and additive: adapters that don't know about triage carry
   * the field through opaquely; consumers that don't want it ignore it. */
  triage?: TriageResult
}

/**
 * PATCH shapes mirror Pivotal's discriminated PATCH surface
 * (body edit | resolve | reopen | overlap-only). Never mix body + resolution
 * in the same patch. Triage is its own variant so the AI onCreate flow
 * writes a structurally distinct patch from human edits; the `{ anchor }`
 * variant covers drag-to-reposition for spatial pins. Mixing any of
 * these is rejected at the adapter boundary.
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
  | { triage: TriageResult }
  | { anchor: AnnotationAnchor }

export type AnchorQuery = { mode: 'route'; path?: string } | { mode: 'spatial'; surfaceId?: string }

export type ListQuery = {
  anchor?: AnchorQuery
  state?: 'open' | 'resolved' | 'all'
}

export type CreateInput = Pick<Annotation, 'anchor' | 'body'> & {
  severity?: Annotation['severity']
  /** Optional screenshot captured at create time (v0.5 modern-screenshot
   * integration). Adapters that persist Annotation.screenshot should
   * carry this through; adapters that don't can ignore it. */
  screenshot?: Annotation['screenshot']
}

/**
 * Screenshot capture callback. Called by the widget BEFORE
 * `api.create()` runs. Return `null` to skip (e.g. SSR, no
 * permissions, capture failed). The widget passes the result through
 * to the adapter as `CreateInput.screenshot`.
 *
 * Default implementation in `screenshot.ts` uses `modern-screenshot`
 * against `document.body` and returns a data URL. Hosts wire their
 * own R2 / S3 / Cloudinary upload here for production.
 */
export type ScreenshotCaptureFn = (
  context: ScreenshotCaptureContext,
) => Promise<Annotation['screenshot'] | null>

export type ScreenshotCaptureContext = {
  /** The element being annotated (drawer mode: the page; overlay mode:
   * the surface). */
  target: Element | null
  /** Hint at which render mode triggered the capture. */
  renderMode: 'drawer' | 'overlay'
}
