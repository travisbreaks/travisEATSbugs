// v0 floating bug button (kept; the new v0.1 work builds on this, doesn't replace it).
export { init, toggle, destroy } from './bug-mode'
export type { InitOptions } from './bug-mode'

// Types
export type {
  Annotation,
  AnnotationAnchor,
  AnchorQuery,
  AuthorRef,
  CreateInput,
  ListQuery,
  TextQuote,
  ThreadEntry,
  TriageResult,
  UpdatePatch,
  Viewport,
} from './types'

// Adapter contracts
export type { ApiAdapter, AuthAdapter, ThemeAdapter } from './adapters'

// Adapter implementations
export { MemoryAdapter, type MemoryAdapterOptions } from './adapter-memory'
export { LocalStorageAdapter, type LocalStorageAdapterOptions } from './adapter-localstorage'
export { defaultAuth } from './auth-stub'

// Reporter mode (anonymous-user share-link flow)
export {
  clearReporterName,
  localStorageReporter,
  type ReporterOptions,
  setReporterName,
} from './reporter'

// Anchor capture helpers
export { captureRouteAnchor } from './anchor-route'
export { captureSpatialAnchor, type SpatialCaptureCoords } from './anchor-spatial'

// Screenshot capture (v0.5 first-mover)
export { defaultScreenshotCapture, wrapWithScreenshot } from './screenshot'
export type { ScreenshotCaptureContext, ScreenshotCaptureFn } from './types'

// AI triage onCreate hook (v0.5)
export { httpTriage, type HttpTriageOptions, type TriageFn, wrapWithTriage } from './triage'

// W3C Web Annotation Data Model conversion (v0.5)
export {
  fromW3C,
  TEB_NAMESPACE,
  toW3C,
  W3C_CONTEXT,
  type TebExtension,
  type W3CAnnotation,
  type W3CCreator,
  type W3CCssSelector,
  type W3CFragmentSelector,
  type W3CSelector,
  type W3CSpecificResource,
  type W3CTextQuoteSelector,
  type W3CTextualBody,
  type W3CXPathSelector,
} from './w3c'

// Render modes
export { AnnotationDrawer, type DrawerOpts, type ReporterPromptConfig } from './drawer'
export {
  AnnotationOverlay,
  type OverlayOpts,
  type OverlayHeaderMode,
} from './overlay'

// Unified facade
export {
  AnnotationWidget,
  TravisEatsBugs,
  type AuditEvent,
  type AuditFn,
  type WidgetMount,
  type WidgetOpts,
  wrapWithAudit,
} from './widget'
