/**
 * Route-watcher tests.
 *
 * Vitest runs against happy-dom. The history-patch is idempotent so
 * tests must reset module state between cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetForTest, onRouteChange } from './route-watcher'

describe('onRouteChange', () => {
  beforeEach(() => {
    __resetForTest()
    history.replaceState(null, '', '/initial')
  })

  afterEach(() => {
    __resetForTest()
  })

  it('fires when history.pushState changes pathname', () => {
    const cb = vi.fn()
    onRouteChange(cb)
    history.pushState(null, '', '/next')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith('/next')
  })

  it('fires when history.replaceState changes pathname', () => {
    const cb = vi.fn()
    onRouteChange(cb)
    history.replaceState(null, '', '/replaced')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith('/replaced')
  })

  it('does NOT fire when pushState keeps the same pathname', () => {
    const cb = vi.fn()
    onRouteChange(cb)
    history.pushState(null, '', '/initial?q=1')
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires on popstate when pathname changes', () => {
    const cb = vi.fn()
    onRouteChange(cb)
    history.pushState(null, '', '/a')
    history.pushState(null, '', '/b')
    expect(cb).toHaveBeenCalledWith('/a')
    expect(cb).toHaveBeenCalledWith('/b')
  })

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn()
    const unsub = onRouteChange(cb)
    history.pushState(null, '', '/one')
    unsub()
    history.pushState(null, '', '/two')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith('/one')
  })

  it('errors thrown by a subscriber do not break the notify loop', () => {
    const bad = vi.fn(() => {
      throw new Error('subscriber bug')
    })
    const good = vi.fn()
    onRouteChange(bad)
    onRouteChange(good)
    history.pushState(null, '', '/breakage')
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('multiple subscribers receive the same notification', () => {
    const a = vi.fn()
    const b = vi.fn()
    onRouteChange(a)
    onRouteChange(b)
    history.pushState(null, '', '/multi')
    expect(a).toHaveBeenCalledWith('/multi')
    expect(b).toHaveBeenCalledWith('/multi')
  })
})
