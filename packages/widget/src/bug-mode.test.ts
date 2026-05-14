import { afterEach, describe, expect, it } from 'vitest'
import { destroy, init } from './bug-mode'

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
})
