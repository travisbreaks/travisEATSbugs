/**
 * Capture a spatial-mode anchor from a click target on a surface element.
 *
 * Returns x,y as % of the surface's bounding rect, clamped to [4, 96]
 * horizontally and [8, 94] vertically (Lion's Share pattern).
 *
 * If `target === surface` (the surface itself was clicked), the caller should
 * pass click coords via the optional 4th arg. Otherwise the function uses the
 * target's bounding-rect center.
 *
 * Source: docs/lions-share-pin-annotations-audit-2026-05-15.md §1 (click-to-place).
 */

import type { AnnotationAnchor } from './types'

const X_MIN = 4
const X_MAX = 96
const Y_MIN = 8
const Y_MAX = 94

export type SpatialCaptureCoords = {
  clientX: number
  clientY: number
  surfaceKind?: 'screenshot' | 'canvas'
}

export function captureSpatialAnchor(
  target: Element,
  surface: Element,
  surfaceId: string,
  coords?: SpatialCaptureCoords,
): AnnotationAnchor {
  const rect = surface.getBoundingClientRect()
  let clientX: number
  let clientY: number
  if (coords) {
    clientX = coords.clientX
    clientY = coords.clientY
  } else {
    const t = target.getBoundingClientRect()
    clientX = t.left + t.width / 2
    clientY = t.top + t.height / 2
  }
  const rawX = ((clientX - rect.left) / Math.max(1, rect.width)) * 100
  const rawY = ((clientY - rect.top) / Math.max(1, rect.height)) * 100
  return {
    mode: 'spatial',
    surface: coords?.surfaceKind ?? 'screenshot',
    surfaceId,
    x: clamp(rawX, X_MIN, X_MAX),
    y: clamp(rawY, Y_MIN, Y_MAX),
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
