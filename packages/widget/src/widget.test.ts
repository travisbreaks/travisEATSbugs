import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageAdapter } from './adapter-localstorage'
import { MemoryAdapter } from './adapter-memory'
import { captureRouteAnchor } from './anchor-route'
import { captureSpatialAnchor } from './anchor-spatial'
import { defaultAuth } from './auth-stub'
import { AnnotationDrawer } from './drawer'
import { AnnotationOverlay } from './overlay'
import type { Annotation, AnnotationAnchor } from './types'
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
  it('captures selector, path, and textQuote from a JSDOM element', () => {
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
      expect(anchor.textQuote?.exact).toContain('target text')
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
