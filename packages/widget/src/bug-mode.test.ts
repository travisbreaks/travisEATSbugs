import { afterEach, describe, expect, it, vi } from 'vitest'
import { destroy, init, toggle } from './bug-mode'

describe('bug-mode v0', () => {
  afterEach(() => {
    destroy()
  })

  it('injects a host element with a shadow root', () => {
    init()
    const host = document.getElementById('travisEATSbugs-host')
    expect(host).not.toBeNull()
    expect(host?.shadowRoot).not.toBeNull()
  })

  it('renders a button inside the shadow root', () => {
    init()
    const host = document.getElementById('travisEATSbugs-host')
    const btn = host?.shadowRoot?.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.getAttribute('aria-label')).toContain('travisEATSbugs')
  })

  it('is idempotent: init() called twice does not create duplicate hosts', () => {
    init()
    init()
    const hosts = document.querySelectorAll('#travisEATSbugs-host')
    expect(hosts.length).toBe(1)
  })

  it('destroy() removes the host element', () => {
    init()
    destroy()
    const host = document.getElementById('travisEATSbugs-host')
    expect(host).toBeNull()
  })

  describe('onToggle callback', () => {
    it('fires on click with the new isActive value', () => {
      const onToggle = vi.fn()
      init({ onToggle })
      const btn = document
        .getElementById('travisEATSbugs-host')
        ?.shadowRoot?.querySelector('button')
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenLastCalledWith(true)
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onToggle).toHaveBeenCalledTimes(2)
      expect(onToggle).toHaveBeenLastCalledWith(false)
    })

    it('also fires when toggle() is called directly (programmatic)', () => {
      const onToggle = vi.fn()
      init({ onToggle })
      toggle()
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('swallows callback errors so the button state stays consistent', () => {
      const onToggle = vi.fn(() => {
        throw new Error('host bug')
      })
      init({ onToggle })
      const btn = document
        .getElementById('travisEATSbugs-host')
        ?.shadowRoot?.querySelector('button')
      expect(() => btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
      // The button still got its aria-pressed flipped to true even though
      // the host callback threw.
      expect(btn?.getAttribute('aria-pressed')).toBe('true')
    })

    it('destroy() clears the handler so next init starts fresh', () => {
      const first = vi.fn()
      init({ onToggle: first })
      destroy()
      const second = vi.fn()
      init({ onToggle: second })
      toggle()
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)
    })
  })
})
