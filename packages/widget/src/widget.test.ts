import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageAdapter } from './adapter-localstorage'
import { MemoryAdapter } from './adapter-memory'
import { captureRouteAnchor } from './anchor-route'
import { captureSpatialAnchor } from './anchor-spatial'
import { defaultAuth } from './auth-stub'
import { AnnotationDrawer } from './drawer'
import { AnnotationOverlay } from './overlay'
import { AnnotationPageMode } from './page-mode'
import { clearReporterName, localStorageReporter, setReporterName } from './reporter'
import { defaultScreenshotCapture, wrapWithScreenshot } from './screenshot'
import type { Annotation, AnnotationAnchor, ScreenshotCaptureFn } from './types'
import { AnnotationWidget, type AuditEvent, TravisEatsBugs, wrapWithAudit } from './widget'

describe('Annotation type assignability', () => {
  it('accepts a route anchor', () => {
    const a: Annotation = {
      id: 'x',
      anchor: { mode: 'route', path: '/' },
      body: 'hi',
      author: { id: 'u1', display: 'Travis' },
      createdAt: 1,
      modifiedAt: 1,
      state: 'open',
    }
    expect(a.anchor.mode).toBe('route')
  })

  it('accepts a spatial anchor', () => {
    const a: Annotation = {
      id: 'y',
      anchor: { mode: 'spatial', surface: 'screenshot', surfaceId: 's1', x: 50, y: 50 },
      body: 'hi',
      author: { id: 'u1', display: 'Travis' },
      createdAt: 1,
      modifiedAt: 1,
      state: 'open',
    }
    expect(a.anchor.mode).toBe('spatial')
  })
})

describe('MemoryAdapter', () => {
  it('creates, lists, updates, and deletes annotations', async () => {
    const adapter = new MemoryAdapter()
    const a = await adapter.create({
      anchor: { mode: 'route', path: '/test' },
      body: 'first',
    })
    expect(a.id).toMatch(/^local-/)
    expect(a.state).toBe('open')
    expect(a.body).toBe('first')

    const list1 = await adapter.list({})
    expect(list1).toHaveLength(1)

    const edited = await adapter.update(a.id, { body: 'edited' })
    expect(edited.body).toBe('edited')

    await adapter.delete(a.id)
    const list2 = await adapter.list({})
    expect(list2).toHaveLength(0)
  })

  it('filters by state', async () => {
    const adapter = new MemoryAdapter()
    const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'b' })
    await adapter.update(a.id, { resolvedPR: 42, resolutionNote: 'done' })

    const open = await adapter.list({ state: 'open' })
    expect(open).toHaveLength(1)
    const resolved = await adapter.list({ state: 'resolved' })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.resolvedPR).toBe(42)
    const all = await adapter.list({ state: 'all' })
    expect(all).toHaveLength(2)
  })

  it('filters by anchor mode and surfaceId', async () => {
    const adapter = new MemoryAdapter()
    await adapter.create({ anchor: { mode: 'route', path: '/a' }, body: 'r' })
    await adapter.create({
      anchor: { mode: 'spatial', surface: 'screenshot', surfaceId: 's1', x: 10, y: 10 },
      body: 's',
    })
    await adapter.create({
      anchor: { mode: 'spatial', surface: 'screenshot', surfaceId: 's2', x: 10, y: 10 },
      body: 't',
    })

    const route = await adapter.list({ anchor: { mode: 'route', path: '/a' } })
    expect(route).toHaveLength(1)
    const s1 = await adapter.list({ anchor: { mode: 'spatial', surfaceId: 's1' } })
    expect(s1).toHaveLength(1)
    expect(s1[0]?.body).toBe('s')
  })

  it('rejects a patch mixing body and resolution', async () => {
    const adapter = new MemoryAdapter()
    const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    await expect(
      adapter.update(a.id, {
        body: 'oops',
        resolvedPR: 1,
      } as unknown as Parameters<MemoryAdapter['update']>[1]),
    ).rejects.toThrow(/cannot be combined/)
  })

  it('reopens by passing resolvedPR: null and clears resolution columns', async () => {
    const adapter = new MemoryAdapter()
    const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    await adapter.update(a.id, { resolvedPR: 12, resolutionNote: 'ship' })
    const reopened = await adapter.update(a.id, { resolvedPR: null })
    expect(reopened.state).toBe('open')
    expect(reopened.resolvedPR).toBeUndefined()
    expect(reopened.resolvedAt).toBeUndefined()
    expect(reopened.resolutionNote).toBeUndefined()
  })

  it('overlap-only patch sets relatedIds without resolving', async () => {
    const adapter = new MemoryAdapter()
    const a = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    const next = await adapter.update(a.id, { relatedIds: ['xyz'] })
    expect(next.state).toBe('open')
    expect(next.relatedIds).toEqual(['xyz'])
  })

  it('listAuthors returns unique authors from current annotations', async () => {
    const adapter = new MemoryAdapter({ currentUser: { id: 'u1', display: 'Alice' } })
    await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'b' })
    const authors = await adapter.listAuthors()
    expect(authors).toHaveLength(1)
    expect(authors[0]?.id).toBe('u1')
  })
})

describe('LocalStorageAdapter', () => {
  // Node 25 ships a partial localStorage global that pollutes the happy-dom
  // window; happy-dom v15 ends up with a null-proto Storage. Install a clean
  // in-test shim so we exercise our adapter, not the runtime quirk.
  function installStorage(): Storage {
    const data = new Map<string, string>()
    const shim = {
      get length() {
        return data.size
      },
      clear: () => {
        data.clear()
      },
      getItem: (k: string) => (data.has(k) ? (data.get(k) ?? null) : null),
      setItem: (k: string, v: string) => {
        data.set(k, String(v))
      },
      removeItem: (k: string) => {
        data.delete(k)
      },
      key: (i: number) => Array.from(data.keys())[i] ?? null,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: shim,
    })
    return shim
  }

  let originalDescriptor: PropertyDescriptor | undefined
  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    installStorage()
  })
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    } else {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined })
    }
  })

  it('round-trip persistence: writes survive a fresh adapter instance', async () => {
    const a1 = new LocalStorageAdapter({ namespace: 'test-roundtrip' })
    await a1.create({ anchor: { mode: 'route', path: '/' }, body: 'one' })
    await a1.create({ anchor: { mode: 'route', path: '/' }, body: 'two' })

    const a2 = new LocalStorageAdapter({ namespace: 'test-roundtrip' })
    const list = await a2.list({})
    expect(list).toHaveLength(2)
    expect(list.map((a) => a.body).sort()).toEqual(['one', 'two'])
  })

  it('namespaces by key so two namespaces do not collide', async () => {
    const a = new LocalStorageAdapter({ namespace: 'ns-a' })
    const b = new LocalStorageAdapter({ namespace: 'ns-b' })
    await a.create({ anchor: { mode: 'route', path: '/' }, body: 'A' })
    expect(await b.list({})).toHaveLength(0)
    expect(await a.list({})).toHaveLength(1)
  })

  it('is SSR-safe when window is undefined', async () => {
    const savedWindow = globalThis.window
    const g = globalThis as { window?: Window }
    g.window = undefined
    try {
      const adapter = new LocalStorageAdapter({ namespace: 'ssr' })
      const list = await adapter.list({})
      expect(list).toEqual([])
      const authors = await adapter.listAuthors()
      expect(authors).toEqual([])
      // create returns a synthetic annotation (no-op persistence)
      const synth = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
      expect(synth.id).toMatch(/^local-/)
    } finally {
      g.window = savedWindow
    }
  })

  it('survives quota errors silently', async () => {
    const adapter = new LocalStorageAdapter({ namespace: 'quota-test' })
    const setItem = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    try {
      // Should not throw.
      await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    } finally {
      window.localStorage.setItem = setItem
    }
  })
})

describe('captureRouteAnchor', () => {
  it('captures selector, path, xpath, and textQuote from a JSDOM element', () => {
    const wrapper = document.createElement('div')
    wrapper.id = 'wrap-tq'
    wrapper.innerHTML = '<p>prefix-text-here <span class="hot">target text</span> trailing-text</p>'
    document.body.appendChild(wrapper)
    const target = wrapper.querySelector('span.hot') as Element
    const anchor = captureRouteAnchor(target)
    expect(anchor.mode).toBe('route')
    if (anchor.mode === 'route') {
      expect(anchor.path).toBeTypeOf('string')
      expect(anchor.selector).toBeTypeOf('string')
      expect(anchor.xpath).toBeTypeOf('string')
      // XPath should start at /html (absolute) and reach the span.
      expect(anchor.xpath?.startsWith('/')).toBe(true)
      expect(anchor.xpath?.endsWith('/span')).toBe(true)
      expect(anchor.textQuote?.exact).toContain('target text')
    }
    document.body.removeChild(wrapper)
  })

  it('xpath uses positional index when multiple same-tag siblings exist', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<ul><li>a</li><li>b</li><li class="t">target</li></ul>'
    document.body.appendChild(wrapper)
    const target = wrapper.querySelector('li.t') as Element
    const anchor = captureRouteAnchor(target)
    if (anchor.mode === 'route') {
      // Third li under the ul; expect the indexed selector for that step.
      expect(anchor.xpath).toContain('li[3]')
    }
    document.body.removeChild(wrapper)
  })

  it('xpath omits index when the tag is unique under its parent', () => {
    const wrapper = document.createElement('div')
    wrapper.id = 'solo-wrap'
    wrapper.innerHTML = '<section><h2>only header</h2></section>'
    document.body.appendChild(wrapper)
    const target = wrapper.querySelector('h2') as Element
    const anchor = captureRouteAnchor(target)
    if (anchor.mode === 'route') {
      // h2 is unique under section -> no positional index needed on that step.
      expect(anchor.xpath?.endsWith('/section/h2')).toBe(true)
    }
    document.body.removeChild(wrapper)
  })
})

describe('captureSpatialAnchor', () => {
  it('clamps x to [4, 96] and y to [8, 94]', () => {
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    // happy-dom returns zeros for getBoundingClientRect by default;
    // patch on the element so we can exercise the math.
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }) as DOMRect
    // Click far outside the surface (negative coords) should clamp to the floor.
    const anchorLow = captureSpatialAnchor(surface, surface, 'srf-test', {
      clientX: -100,
      clientY: -100,
    })
    if (anchorLow.mode === 'spatial') {
      expect(anchorLow.x).toBe(4)
      expect(anchorLow.y).toBe(8)
    }
    // Click far outside the surface (way past) should clamp to the ceiling.
    const anchorHigh = captureSpatialAnchor(surface, surface, 'srf-test', {
      clientX: 999,
      clientY: 999,
    })
    if (anchorHigh.mode === 'spatial') {
      expect(anchorHigh.x).toBe(96)
      expect(anchorHigh.y).toBe(94)
    }
    // Click at midpoint should land near 50, 50 inside the clamp band.
    const anchorMid = captureSpatialAnchor(surface, surface, 'srf-test', {
      clientX: 50,
      clientY: 50,
    })
    if (anchorMid.mode === 'spatial') {
      expect(anchorMid.x).toBeCloseTo(50)
      expect(anchorMid.y).toBeCloseTo(50)
    }
    document.body.removeChild(surface)
  })

  it('passes through surfaceKind option', () => {
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }) as DOMRect
    const a: AnnotationAnchor = captureSpatialAnchor(surface, surface, 'sf', {
      clientX: 10,
      clientY: 10,
      surfaceKind: 'canvas',
    })
    if (a.mode === 'spatial') {
      expect(a.surface).toBe('canvas')
    }
    document.body.removeChild(surface)
  })
})

describe('defaultAuth', () => {
  it('returns the demo user', async () => {
    const u = await defaultAuth.getCurrentUser()
    expect(u?.id).toBe('demo')
    expect(u?.display).toBe('You')
  })
})

describe('reporter mode (localStorage-backed identity)', () => {
  // Same Storage shim trick the LocalStorageAdapter tests use, since
  // happy-dom v15 + Node 25 don't always agree on `localStorage`.
  function installStorage(): Storage {
    const data = new Map<string, string>()
    const shim = {
      get length() {
        return data.size
      },
      clear: () => {
        data.clear()
      },
      getItem: (k: string) => (data.has(k) ? (data.get(k) ?? null) : null),
      setItem: (k: string, v: string) => {
        data.set(k, String(v))
      },
      removeItem: (k: string) => {
        data.delete(k)
      },
      key: (i: number) => Array.from(data.keys())[i] ?? null,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: shim })
    return shim
  }

  let originalDescriptor: PropertyDescriptor | undefined
  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    installStorage()
  })
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    } else {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined })
    }
  })

  it('localStorageReporter: returns null when nothing stored', async () => {
    const auth = localStorageReporter({ namespace: 'test-empty' })
    expect(await auth.getCurrentUser()).toBeNull()
  })

  it('setReporterName + localStorageReporter round-trip', async () => {
    setReporterName('Alex', { namespace: 'test-rt' })
    const auth = localStorageReporter({ namespace: 'test-rt' })
    const user = await auth.getCurrentUser()
    expect(user?.display).toBe('Alex')
    expect(user?.id).toMatch(/^reporter-/)
  })

  it('setReporterName preserves the id when renaming', async () => {
    const a = setReporterName('Alex', { namespace: 'test-rename' })
    const b = setReporterName('Alex Lee', { namespace: 'test-rename' })
    expect(b.id).toBe(a.id)
    expect(b.display).toBe('Alex Lee')
  })

  it('setReporterName throws on empty name', () => {
    expect(() => setReporterName('   ', { namespace: 'test-empty' })).toThrow(/cannot be empty/)
  })

  it('clearReporterName removes the stored identity', async () => {
    setReporterName('Temp', { namespace: 'test-clear' })
    const auth = localStorageReporter({ namespace: 'test-clear' })
    expect(await auth.getCurrentUser()).not.toBeNull()
    clearReporterName({ namespace: 'test-clear' })
    expect(await auth.getCurrentUser()).toBeNull()
  })

  it('MemoryAdapter.setCurrentUser updates author on subsequent creates', async () => {
    const adapter = new MemoryAdapter({ currentUser: { id: 'before', display: 'Before' } })
    const first = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'a' })
    expect(first.author.id).toBe('before')
    adapter.setCurrentUser({ id: 'after', display: 'After' })
    const second = await adapter.create({ anchor: { mode: 'route', path: '/' }, body: 'b' })
    expect(second.author.id).toBe('after')
    // The first annotation's author is not retroactively changed.
    const list = await adapter.list()
    expect(list[0]?.author.id).toBe('before')
    expect(list[1]?.author.id).toBe('after')
  })

  it('drawer with reporterPrompt shows the prompt when auth returns null', async () => {
    const api = new MemoryAdapter()
    const drawer = new AnnotationDrawer({
      api,
      auth: {
        async getCurrentUser() {
          return null
        },
      },
      reporterPrompt: { namespace: 'test-drawer-prompt' },
      anchorQuery: () => ({ mode: 'route', path: '/' }),
      open: true,
    })
    drawer.mount()
    await vi.waitFor(() => {
      const panel = document
        .getElementById('travisEATSbugs-drawer-host')
        ?.shadowRoot?.querySelector<HTMLDivElement>('.panel')
      expect(panel?.dataset.reporterAwait).toBe('true')
    })
    const prompt = document
      .getElementById('travisEATSbugs-drawer-host')
      ?.shadowRoot?.querySelector<HTMLDivElement>('.reporter-prompt')
    expect(prompt?.hidden).toBe(false)
    drawer.unmount()
  })

  it('drawer hides prompt + swaps adapter identity after name submit', async () => {
    const api = new MemoryAdapter({ currentUser: { id: 'anon', display: 'Anon' } })
    const drawer = new AnnotationDrawer({
      api,
      auth: {
        async getCurrentUser() {
          return null
        },
      },
      reporterPrompt: { namespace: 'test-drawer-submit' },
      anchorQuery: () => ({ mode: 'route', path: '/' }),
      open: true,
    })
    drawer.mount()
    await vi.waitFor(() => {
      const panel = document
        .getElementById('travisEATSbugs-drawer-host')
        ?.shadowRoot?.querySelector<HTMLDivElement>('.panel')
      expect(panel?.dataset.reporterAwait).toBe('true')
    })
    const host = document.getElementById('travisEATSbugs-drawer-host')
    const input = host?.shadowRoot?.querySelector<HTMLInputElement>('.reporter-input')
    const submit = host?.shadowRoot?.querySelector<HTMLButtonElement>('.reporter-submit-btn')
    expect(input).not.toBeNull()
    if (input && submit) {
      input.value = 'Reporter Jane'
      submit.click()
    }
    await vi.waitFor(() => {
      const panel = host?.shadowRoot?.querySelector<HTMLDivElement>('.panel')
      expect(panel?.dataset.reporterAwait).toBe('false')
    })
    const created = await api.create({ anchor: { mode: 'route', path: '/' }, body: 'after' })
    expect(created.author.display).toBe('Reporter Jane')
    drawer.unmount()
  })

  it('overlay shows reporter overlay + drops surface clicks while awaiting', async () => {
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0 }) as DOMRect
    const api = new MemoryAdapter()
    const overlay = new AnnotationOverlay({
      api,
      auth: {
        async getCurrentUser() {
          return null
        },
      },
      surface,
      surfaceId: 'reporter-test',
      reporterPrompt: { namespace: 'test-overlay-prompt' },
    })
    overlay.mount()
    await vi.waitFor(() => {
      const block = surface
        .querySelector('[data-travisEATSbugs-overlay]')
        ?.shadowRoot?.querySelector<HTMLDivElement>('.reporter-overlay')
      expect(block?.hidden).toBe(false)
    })
    // A click on the surface while awaiting should NOT create a draft.
    surface.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true }))
    const draft = surface
      .querySelector('[data-travisEATSbugs-overlay]')
      ?.shadowRoot?.querySelector('.draft')
    expect(draft).toBeNull()
    overlay.unmount()
    document.body.removeChild(surface)
  })
})

describe('wrapWithScreenshot', () => {
  it('fires the capture callback before create and attaches the result', async () => {
    const api = new MemoryAdapter()
    const capture: ScreenshotCaptureFn = vi.fn(async () => ({
      url: 'data:image/png;base64,fake',
      w: 320,
      h: 200,
    }))
    const wrapped = wrapWithScreenshot(api, capture, 'drawer')
    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'with screenshot',
    })
    expect(capture).toHaveBeenCalledTimes(1)
    expect(created.screenshot).toEqual({
      url: 'data:image/png;base64,fake',
      w: 320,
      h: 200,
    })
  })

  it('proceeds without a screenshot when capture returns null', async () => {
    const api = new MemoryAdapter()
    const wrapped = wrapWithScreenshot(api, async () => null, 'overlay')
    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'no shot',
    })
    expect(created.screenshot).toBeUndefined()
    expect(created.body).toBe('no shot')
  })

  it('swallows capture errors so create still resolves', async () => {
    const api = new MemoryAdapter()
    const wrapped = wrapWithScreenshot(
      api,
      async () => {
        throw new Error('capture blew up')
      },
      'drawer',
    )
    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'still lands',
    })
    expect(created.body).toBe('still lands')
    expect(created.screenshot).toBeUndefined()
  })

  it('passes the render-mode context to the capture callback', async () => {
    const api = new MemoryAdapter()
    const received: Array<{ renderMode: string }> = []
    const capture: ScreenshotCaptureFn = async (ctx) => {
      received.push({ renderMode: ctx.renderMode })
      return null
    }
    const wrapped = wrapWithScreenshot(api, capture, 'overlay')
    await wrapped.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    expect(received[0]?.renderMode).toBe('overlay')
  })

  it('forwards list / update / delete unchanged', async () => {
    const api = new MemoryAdapter()
    const capture: ScreenshotCaptureFn = vi.fn(async () => null)
    const wrapped = wrapWithScreenshot(api, capture, 'drawer')
    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'one',
    })
    capture.mockClear?.()
    await wrapped.list()
    await wrapped.update(created.id, { body: 'two' })
    await wrapped.delete(created.id)
    // No further screenshot captures for list / update / delete.
    expect(capture).toHaveBeenCalledTimes(0)
  })
})

describe('defaultScreenshotCapture', () => {
  it('is exported as a callable function', () => {
    // The real capture path hits the DOM-to-canvas pipeline which
    // happy-dom doesn't fully implement (no foreignObject serialize,
    // no canvas rasterize). The function returns null OR a data URL at
    // runtime; both shapes are valid. We assert the exported surface
    // here; behavior is exercised by wrapWithScreenshot tests above
    // using an injected mock capture function (which is what hosts
    // actually do).
    expect(typeof defaultScreenshotCapture).toBe('function')
  })
})

describe('wrapWithAudit', () => {
  it('fires onAudit on create, update, delete (in order)', async () => {
    const api = new MemoryAdapter()
    const events: AuditEvent[] = []
    const wrapped = wrapWithAudit(api, (e) => events.push(e))

    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'one',
    })
    await wrapped.update(created.id, { body: 'two' })
    await wrapped.delete(created.id)

    expect(events.map((e) => e.action)).toEqual(['create', 'update', 'delete'])
    if (events[0]?.action === 'create') {
      expect(events[0].annotation.body).toBe('one')
    }
    if (events[1]?.action === 'update') {
      expect(events[1].id).toBe(created.id)
      expect(events[1].annotation.body).toBe('two')
    }
    if (events[2]?.action === 'delete') {
      expect(events[2].id).toBe(created.id)
    }
  })

  it('list passes through without firing onAudit (read-only)', async () => {
    const api = new MemoryAdapter()
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    const onAudit = vi.fn()
    const wrapped = wrapWithAudit(api, onAudit)
    const result = await wrapped.list()
    expect(result).toHaveLength(1)
    expect(onAudit).not.toHaveBeenCalled()
  })

  it('swallows host callback errors so mutations still resolve', async () => {
    const api = new MemoryAdapter()
    const wrapped = wrapWithAudit(api, () => {
      throw new Error('host bug')
    })
    const created = await wrapped.create({
      anchor: { mode: 'route', path: '/' },
      body: 'x',
    })
    expect(created.body).toBe('x')
    const updated = await wrapped.update(created.id, { body: 'y' })
    expect(updated.body).toBe('y')
    await expect(wrapped.delete(created.id)).resolves.toBeUndefined()
  })

  it('forwards listAuthors when the underlying adapter supports it', async () => {
    const api = new MemoryAdapter()
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    const wrapped = wrapWithAudit(api, () => {})
    expect(wrapped.listAuthors).toBeDefined()
    const authors = await wrapped.listAuthors?.()
    expect(authors?.length ?? 0).toBeGreaterThan(0)
  })

  it('does NOT fire onAudit when the host bypasses the wrap', async () => {
    const api = new MemoryAdapter()
    const onAudit = vi.fn()
    wrapWithAudit(api, onAudit)
    // Mutate the underlying adapter directly; the wrap has no knowledge.
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'x' })
    expect(onAudit).not.toHaveBeenCalled()
  })
})

describe('AnnotationWidget (drawer mode)', () => {
  let widget: AnnotationWidget | null = null
  afterEach(() => {
    widget?.destroy()
    widget = null
    for (const node of document.querySelectorAll('#travisEATSbugs-drawer-host')) {
      node.parentNode?.removeChild(node)
    }
  })

  it('mounts in drawer mode with a memory adapter', () => {
    const api = new MemoryAdapter()
    widget = new AnnotationWidget({ renderMode: 'drawer', api })
    widget.mount()
    expect(widget.renderMode).toBe('drawer')
    const host = document.getElementById('travisEATSbugs-drawer-host')
    expect(host).not.toBeNull()
    expect(host?.shadowRoot).not.toBeNull()
  })

  it('TravisEatsBugs alias points to AnnotationWidget', () => {
    expect(TravisEatsBugs).toBe(AnnotationWidget)
  })

  it('toggle() opens and closes the panel', () => {
    const api = new MemoryAdapter()
    widget = new AnnotationWidget({ renderMode: 'drawer', api })
    widget.mount()
    widget.toggle()
    const panel = document
      .getElementById('travisEATSbugs-drawer-host')
      ?.shadowRoot?.querySelector<HTMLDivElement>('.panel')
    expect(panel?.dataset.open).toBe('true')
    widget.toggle()
    expect(panel?.dataset.open).toBe('false')
  })

  it('AnnotationDrawer alone is usable without the facade', async () => {
    const api = new MemoryAdapter()
    await api.create({
      anchor: { mode: 'route', path: '/' },
      body: 'pre-seeded',
    })
    const drawer = new AnnotationDrawer({
      api,
      anchorQuery: () => ({ mode: 'route', path: '/' }),
      open: true,
    })
    drawer.mount()
    // wait one tick for the async load
    await vi.waitFor(() => {
      const list = document
        .getElementById('travisEATSbugs-drawer-host')
        ?.shadowRoot?.querySelector('.list')
      expect(list?.querySelectorAll('.item').length).toBe(1)
    })
    drawer.unmount()
  })

  it('drawer kind filter scopes the rendered list + updates counts', async () => {
    const api = new MemoryAdapter()
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'b1', kind: 'bug' })
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'f1', kind: 'feature' })
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'n1', kind: 'note' })
    await api.create({ anchor: { mode: 'route', path: '/' }, body: 'plain' })
    const drawer = new AnnotationDrawer({
      api,
      anchorQuery: () => ({ mode: 'route', path: '/' }),
      open: true,
    })
    drawer.mount()
    const shadow = () => document.getElementById('travisEATSbugs-drawer-host')?.shadowRoot
    await vi.waitFor(() => {
      const items = shadow()?.querySelectorAll('.list .item')
      expect(items?.length).toBe(4)
    })
    const counts: Record<string, string | null | undefined> = {}
    for (const k of ['all', 'bug', 'feature', 'note', 'unclassified']) {
      counts[k] = shadow()?.querySelector(`[data-count-for="${k}"]`)?.textContent
    }
    expect(counts.all).toBe('4')
    expect(counts.bug).toBe('1')
    expect(counts.feature).toBe('1')
    expect(counts.note).toBe('1')
    expect(counts.unclassified).toBe('1')

    // Click the Bug filter; list shrinks to one item.
    shadow()?.querySelector<HTMLButtonElement>('.filter-pill[data-filter="bug"]')?.click()
    await vi.waitFor(() => {
      const items = shadow()?.querySelectorAll('.list .item')
      expect(items?.length).toBe(1)
    })
    expect(
      shadow()?.querySelector<HTMLButtonElement>('.filter-pill[data-filter="bug"]')?.classList
        .contains('is-active'),
    ).toBe(true)

    // Unclassified filter shows only the no-kind note.
    shadow()
      ?.querySelector<HTMLButtonElement>('.filter-pill[data-filter="unclassified"]')
      ?.click()
    await vi.waitFor(() => {
      const items = shadow()?.querySelectorAll('.list .item')
      expect(items?.length).toBe(1)
      expect(shadow()?.querySelector('.list .item .item-body')?.textContent).toBe('plain')
    })

    drawer.unmount()
  })
})

describe('AnnotationPageMode kind badges', () => {
  it('colors pin markers by kind, leaves unclassified pins on the default', async () => {
    const target1 = document.createElement('button')
    target1.id = 'kind-target-bug'
    target1.textContent = 'bug target'
    const target2 = document.createElement('button')
    target2.id = 'kind-target-plain'
    target2.textContent = 'plain target'
    document.body.appendChild(target1)
    document.body.appendChild(target2)
    target1.getBoundingClientRect = () =>
      ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20, x: 10, y: 10 }) as DOMRect
    target2.getBoundingClientRect = () =>
      ({
        left: 60,
        top: 60,
        right: 80,
        bottom: 80,
        width: 20,
        height: 20,
        x: 60,
        y: 60,
      }) as DOMRect

    const api = new MemoryAdapter()
    await api.create({
      anchor: { mode: 'route', path: '/kind-pins', selector: '#kind-target-bug' },
      body: 'bug pin',
      kind: 'bug',
    })
    await api.create({
      anchor: { mode: 'route', path: '/kind-pins', selector: '#kind-target-plain' },
      body: 'plain pin',
    })

    const page = new AnnotationPageMode({
      api,
      routeFilter: () => '/kind-pins',
    })
    page.mount()
    page.activate()

    await vi.waitFor(() => {
      const host = document.getElementById('travisEATSbugs-page-host')
      const pins = host?.shadowRoot?.querySelectorAll('[data-teb-pin]')
      expect(pins?.length).toBe(2)
    })
    const host = document.getElementById('travisEATSbugs-page-host')
    const pins = Array.from(
      host?.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-teb-pin]') ?? [],
    )
    const bugPin = pins.find((p) => p.dataset.kind === 'bug')
    const plainPin = pins.find((p) => !p.dataset.kind)
    expect(bugPin?.classList.contains('teb-pin-bug')).toBe(true)
    expect(plainPin?.classList.contains('teb-pin-bug')).toBe(false)
    expect(plainPin?.classList.contains('teb-pin-feature')).toBe(false)
    expect(plainPin?.classList.contains('teb-pin-note')).toBe(false)

    page.destroy()
    document.body.removeChild(target1)
    document.body.removeChild(target2)
  })
})

describe('AnnotationWidget (overlay mode)', () => {
  it('mounts in overlay mode with a memory adapter', () => {
    const surface = document.createElement('div')
    surface.id = 'overlay-surface'
    document.body.appendChild(surface)
    const api = new MemoryAdapter()
    const widget = new AnnotationWidget({
      renderMode: 'overlay',
      api,
      surface,
      surfaceId: 'overlay-surface',
    })
    widget.mount()
    expect(widget.renderMode).toBe('overlay')
    const overlayHost = surface.querySelector('[data-travisEATSbugs-overlay]')
    expect(overlayHost).not.toBeNull()
    widget.destroy()
    document.body.removeChild(surface)
  })

  it('AnnotationOverlay renders markers for spatial annotations', async () => {
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }) as DOMRect
    const api = new MemoryAdapter()
    await api.create({
      anchor: { mode: 'spatial', surface: 'screenshot', surfaceId: 'ovl-1', x: 25, y: 25 },
      body: 'pin one',
    })
    await api.create({
      anchor: { mode: 'spatial', surface: 'screenshot', surfaceId: 'ovl-1', x: 75, y: 75 },
      body: 'pin two',
    })
    const overlay = new AnnotationOverlay({ api, surface, surfaceId: 'ovl-1' })
    overlay.mount()
    await vi.waitFor(() => {
      const markers = surface
        .querySelector('[data-travisEATSbugs-overlay]')
        ?.shadowRoot?.querySelectorAll('.marker')
      expect(markers?.length).toBe(2)
    })
    overlay.unmount()
    document.body.removeChild(surface)
  })
})
