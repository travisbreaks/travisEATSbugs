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

  describe('positioning + sizing (0.0.8)', () => {
    function readStyles(): string {
      const host = document.getElementById('travisEATSbugs-host')
      return host?.shadowRoot?.querySelector('style')?.textContent ?? ''
    }

    it('defaults to bottom-right corner preset using --teb-offset var', () => {
      init()
      const css = readStyles()
      expect(css).toContain('bottom: var(--teb-offset);')
      expect(css).toContain('right: var(--teb-offset);')
      expect(css).not.toContain('top: var(--teb-offset);')
      expect(css).not.toContain('left: var(--teb-offset);')
    })

    it('honors `position: top-left` corner preset', () => {
      init({ position: 'top-left' })
      const css = readStyles()
      expect(css).toContain('top: var(--teb-offset);')
      expect(css).toContain('left: var(--teb-offset);')
      expect(css).not.toContain('bottom: var(--teb-offset);')
      expect(css).not.toContain('right: var(--teb-offset);')
    })

    it('explicit `offset` overrides the corner preset per edge', () => {
      init({ offset: { right: 88, bottom: 24 } })
      const css = readStyles()
      // Explicit px values land in the button CSS rule:
      expect(css).toContain('right: 88px;')
      expect(css).toContain('bottom: 24px;')
      // Falls back to the var for unspecified edges (none for bottom-right
      // default, but the rendered CSS must not still contain the bare var
      // for right/bottom now that they have explicit values):
      expect(css).not.toContain('bottom: var(--teb-offset);')
      expect(css).not.toContain('right: var(--teb-offset);')
    })

    it('explicit `offset` on one edge keeps preset on the other', () => {
      init({ offset: { right: 88 } })
      const css = readStyles()
      expect(css).toContain('right: 88px;')
      // bottom-right preset's bottom edge stays on the var:
      expect(css).toContain('bottom: var(--teb-offset);')
    })

    it('`size` override applies to --teb-size and disables mobile bump', () => {
      init({ size: 56 })
      const css = readStyles()
      expect(css).toContain('--teb-size: 56px;')
      // Mobile media query no longer sets --teb-size:
      expect(css).not.toContain('--teb-size: 52px;')
    })

    it('`size` enforces 44px touch-target minimum', () => {
      init({ size: 20 })
      const css = readStyles()
      expect(css).toContain('--teb-size: 44px;')
      expect(css).not.toContain('--teb-size: 20px;')
    })
  })

  describe('animation modes (0.0.8)', () => {
    function readStyles(): string {
      const host = document.getElementById('travisEATSbugs-host')
      return host?.shadowRoot?.querySelector('style')?.textContent ?? ''
    }

    it('defaults to wiggle: button breathes + mark wiggles', () => {
      init()
      const css = readStyles()
      expect(css).toContain('animation: teb-breathe 5400ms')
      expect(css).toContain('animation: teb-sticky 4800ms')
    })

    it('animation: minimal keeps breathing but kills the wiggle', () => {
      init({ animation: 'minimal' })
      const css = readStyles()
      expect(css).toContain('animation: teb-breathe 5400ms')
      expect(css).not.toContain('animation: teb-sticky 4800ms')
    })

    it('animation: none disables both breathing and wiggle', () => {
      init({ animation: 'none' })
      const css = readStyles()
      expect(css).not.toContain('animation: teb-breathe')
      expect(css).not.toContain('animation: teb-sticky')
      // Both ambient layers report animation: none explicitly so prior
      // host-injected animation overrides cannot leak through.
      expect((css.match(/animation: none;/g) ?? []).length).toBeGreaterThanOrEqual(2)
    })
  })
})
