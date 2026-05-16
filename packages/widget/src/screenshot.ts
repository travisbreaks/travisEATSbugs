/**
 * Screenshot capture (v0.5 first-mover).
 *
 * Two pieces:
 *   1. `defaultScreenshotCapture` uses `modern-screenshot` to grab a
 *      PNG data URL of the target element (drawer mode) or surface
 *      (overlay mode). Returns null in non-browser contexts so SSR /
 *      tests can call it safely.
 *   2. `wrapWithScreenshot(api, capture, renderMode)` wraps an
 *      ApiAdapter so `create` invokes the capture callback and threads
 *      the result through as `CreateInput.screenshot`. Mirrors the
 *      `wrapWithAudit` pattern in `widget.ts` so drawer + overlay
 *      don't need to know about screenshots.
 *
 * Hosts that want production-grade screenshots (R2 upload, CDN URL)
 * pass their own ScreenshotCaptureFn instead of the default. The
 * default is suitable for demos + the playground, not for prod-scale
 * use (data URLs in D1 rows are space-inefficient).
 */

import type { ApiAdapter } from './adapters'
import type {
  Annotation,
  CreateInput,
  ScreenshotCaptureContext,
  ScreenshotCaptureFn,
} from './types'

type ModernScreenshotModule = {
  domToPng?: (
    target: Node,
    options?: { width?: number; height?: number; quality?: number },
  ) => Promise<string>
}

/**
 * Lazily import modern-screenshot so a host that doesn't enable
 * screenshots never pays the bundle cost at runtime. Returns null when
 * the import fails (e.g. in Node-only contexts or if the dep is
 * pinned-out by tree-shaking).
 */
async function loadModernScreenshot(): Promise<ModernScreenshotModule | null> {
  try {
    const mod = (await import('modern-screenshot')) as ModernScreenshotModule
    return mod
  } catch {
    return null
  }
}

/**
 * Default screenshot capture. Uses `modern-screenshot.domToPng` against
 * the context target (or document.body if none provided). Returns a
 * `{ url, w, h }` shape where `url` is a base64 data URL. Returns null
 * if `window` is undefined or if the capture throws.
 */
export const defaultScreenshotCapture: ScreenshotCaptureFn = async (
  context: ScreenshotCaptureContext,
) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }
  const target = context.target ?? document.body
  if (!target) return null
  const mod = await loadModernScreenshot()
  if (!mod?.domToPng) return null
  try {
    const url = await mod.domToPng(target)
    // Width / height come from the bounding rect; data URL doesn't
    // carry them directly. Hosts that need exact pixel dimensions can
    // decode the PNG; for v0.5 we report bounding-box w/h which is
    // close enough for inbox previews.
    const rect =
      target instanceof Element && typeof target.getBoundingClientRect === 'function'
        ? target.getBoundingClientRect()
        : null
    return {
      url,
      w: rect ? Math.round(rect.width) : 0,
      h: rect ? Math.round(rect.height) : 0,
    }
  } catch {
    return null
  }
}

/**
 * Wrap an ApiAdapter so `create` invokes a screenshot-capture callback
 * BEFORE delegating. If the callback returns null, create proceeds
 * without a screenshot. List / update / delete pass through unchanged.
 *
 * Exported as a public utility so hosts can compose screenshot + audit
 * wraps in their preferred order.
 */
export function wrapWithScreenshot(
  api: ApiAdapter,
  capture: ScreenshotCaptureFn,
  renderMode: 'drawer' | 'overlay',
  resolveTarget: () => Element | null = () =>
    typeof document !== 'undefined' ? document.body : null,
): ApiAdapter {
  const wrapped: ApiAdapter = {
    list: (q) => api.list(q),
    create: async (input: CreateInput) => {
      let screenshot: Annotation['screenshot'] | null = null
      try {
        screenshot = await capture({ target: resolveTarget(), renderMode })
      } catch {
        // capture threw; degrade gracefully so the create still lands.
        screenshot = null
      }
      const enriched: CreateInput = screenshot ? { ...input, screenshot } : input
      return api.create(enriched)
    },
    update: (id, patch) => api.update(id, patch),
    delete: (id) => api.delete(id),
  }
  if (api.listAuthors) {
    const fn = api.listAuthors.bind(api)
    wrapped.listAuthors = fn
  }
  return wrapped
}
