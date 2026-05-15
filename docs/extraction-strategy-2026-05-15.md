# travisEATSbugs as the primitive: extraction strategy

Date: 2026-05-15
Status: scope-pass-1, ready for implementation greenlight
Companion docs:
- `pivotal-extraction-audit-2026-05-15.md`
- `lions-share-pin-annotations-audit-2026-05-15.md`

---

## The decision (locked 2026-05-15)

travisEATSbugs is **the primitive** that both Pivotal Agency and Lion's Share Digital consume. Not a parallel implementation. Not a future swap-in. The unified widget ships first, both products migrate onto it.

Why now: Pivotal page-notes has grown from a 22-line migration into a closed-loop triage system with overlap tracking across three schema revisions and five branches, and Lion's Share already has a 704-line parallel implementation living in `pin-annotations.tsx`. Letting both keep evolving independently buys nothing and guarantees the divergence widens. The earlier "v1 swap-in" plan in `lions-share-dashboard-2026-05-14.md` is superseded by this strategy.

## The reconciliation problem

The two existing implementations disagree on the two most load-bearing decisions: how an annotation is anchored, and how it renders.

| Decision | Pivotal | Lion's Share |
|---|---|---|
| Anchor | `page_path` (route-based, real DOM) | `x, y %` (spatial, faux-canvas) |
| Render | Floating button + drawer (real DOM) | Markers overlaid on a canvas + sidebar |
| Persistence | D1 (server) | localStorage (client, v0.8 → D1) |
| State | Open + resolved + overlap (3 generations) | Open + resolved (toggle only) |
| Author | `author_id` (FK app_users) | display-name string |

Neither side is "wrong." They're solving different surface problems: Pivotal feedback happens **on a deployed app while you browse it**; Lion's Share feedback happens **on a staging preview screenshot before deploy**. The widget needs both modes.

## The unified data model

```ts
type Annotation = {
  id: string;                     // uuid or `local-${ts}` for unsynced
  anchor: AnnotationAnchor;
  body: string;
  author: AuthorRef;
  createdAt: number;              // unixepoch
  modifiedAt: number;
  state: 'open' | 'resolved';
  resolvedPR?: number;
  resolvedAt?: number;
  resolvedBy?: string;
  resolutionNote?: string;
  relatedIds?: string[];          // overlap tracking
  dupOf?: string;
  severity?: 'low' | 'medium' | 'high';
  thread?: ThreadEntry[];
  screenshot?: { url: string; w: number; h: number };
};

type AnnotationAnchor =
  | { mode: 'route'; path: string; selector?: string; textQuote?: TextQuote; viewport?: Viewport }
  | { mode: 'spatial'; surface: 'screenshot' | 'canvas'; surfaceId: string; x: number; y: number };

type AuthorRef = { id: string; display: string; avatarUrl?: string };
type TextQuote = { exact: string; prefix?: string; suffix?: string };  // W3C Web Annotation
type Viewport = { x: number; y: number; w: number; h: number };
```

This covers both Pivotal's path-based anchoring (with the path-plus-selector composite key from the OSS research doc) and Lion's Share's spatial anchoring. The resolution + overlap + audit columns come straight from Pivotal's mig 045 + 058.

## Two render modes, one widget

```ts
type WidgetMount =
  | { renderMode: 'drawer'; position?: { bottom: number; right: number }; floatingButton?: ButtonConfig }
  | { renderMode: 'overlay'; surfaceRef: RefObject<HTMLElement>; headerMode?: 'mac-chrome' | 'minimal' | 'none' };
```

Drawer mode = Pivotal pattern. Overlay mode = Lion's Share pattern. Single component, switched by mount prop. Both share the compose / edit / delete / resolve / overlap flows underneath.

## Adapter contracts

The widget owns no I/O. Three adapters bridge to host apps.

```ts
type ApiAdapter = {
  list(query: { anchor?: AnchorQuery; state?: 'open' | 'resolved' | 'all' }): Promise<Annotation[]>;
  create(input: Pick<Annotation, 'anchor' | 'body' | 'severity'>): Promise<Annotation>;
  update(id: string, patch: UpdatePatch): Promise<Annotation>;
  delete(id: string): Promise<void>;
  listAuthors?(): Promise<AuthorRef[]>;  // for triage inbox
};

type AuthAdapter = {
  getCurrentUser(): Promise<AuthorRef | null>;
  canAdmin?(user: AuthorRef): boolean;
};

type ThemeAdapter = {
  cssVars?: Record<string, string>;
  buttonIcon?: ReactNode;
  buttonLabel?: string;
  drawerTitle?: string;
  emptyStateCopy?: string;
  footerHint?: string;
  prUrlTemplate?: (n: number) => string;
  inferSeverity?: (a: Annotation) => 'low' | 'medium' | 'high';
};
```

Pivotal ships a `pivotal-adapter` that wires the existing `/api/page-notes` routes + auth-stub.
Lion's Share ships a `lions-share-adapter` that wires localStorage in v0.8.0, swaps to a D1-backed worker in v0.8.1.
Future clients ship their own adapters or use the default `@travisbreaks/travisEATSbugs-cloudflare` (D1 + R2) or `@travisbreaks/travisEATSbugs-http` (BYO backend) adapters from the existing scaffold.

## The triage inbox

Ships as a separate component, optional consumer pattern. Pivotal currently uses it at `/admin/page-notes-inbox`. Lion's Share doesn't yet, but the `/tracks` aggregator is conceptually parallel and should converge.

```ts
<AnnotationInbox
  adapter={apiAdapter}
  auth={authAdapter}
  theme={themeAdapter}
  filters={{ state: 'open', author: undefined }}
  showOverlapHints
/>
```

The heuristic overlap detector (from Pivotal mig 058 era) ships as a default scoring function with adapter-overridable rule.

## Migration sequence

Phase 0 (this session, today): docs landed. Audits + strategy + this file form the implementation contract.

Phase 1 (v0.1, target this week): build the widget core in `packages/widget/` using the unified `Annotation` model and the dual render modes. No backend yet. The playground app exercises both modes against an in-memory adapter. Five v0.1 issues already filed map directly to this phase.

Phase 2 (v0.2, target next week): ship the two backend adapters (`adapter-cloudflare`: D1 + R2 + worker; `adapter-http`: BYO). Both go through CF Worker at `eats.travisfixes.com` as the default hosted backend. Migrations 043 + 045 + 058 ported into `adapter-cloudflare/migrations/` with namespacing.

Phase 3 (v0.3, "Pivotal cutover"): write `pivotal-adapter` in pivotal-replacement. Swap `<PageNotesDrawer />` for `<AnnotationWidget renderMode="drawer" adapter={pivotalAdapter} />`. Verify 21/21 smoke green. Keep migration 043 + 045 + 058 in place; the widget reads the same D1 table through the new adapter layer. Cole sees no behavior change.

Phase 4 (v0.4, "Lion's Share cutover"): write `lions-share-adapter`. Swap `<PinAnnotations />` for `<AnnotationWidget renderMode="overlay" adapter={lionsAdapter} headerMode="mac-chrome" />`. v0.8 D1 wire happens through the widget's adapter, not parallel.

Phase 5 (v0.5+): AI triage hook (`onCreate → CF Worker → Claude → severity/category/dupe-of`), screenshot capture, real-DOM anchoring with `@medv/finder`, W3C Web Annotation text-quote fallback, sticky-note Motion animation.

## What this preserves

- Pivotal stays live the entire time. The cutover is a one-PR swap, not a rewrite.
- Pivotal's resolution + overlap + audit + admin inbox features all survive (they become widget primitives).
- Cole's specific UX polish (refocus, race-condition optimistic clear) ports over and benefits every consumer.
- Lion's Share's faux-Chrome aesthetic survives as `headerMode: 'mac-chrome'`.
- Lion's Share's `/tracks` severity rule survives as the host-supplied `inferSeverity` callback.
- Each product keeps its own theme: signal pink for travisEATSbugs marketing, Pivotal red for Pivotal, burnt orange for Lion's Share, whatever for future clients.

## What this changes

- Lion's Share v0.8 stops wiring localStorage directly and instead picks up the widget adapter (small refactor, no UX change).
- The "v1 swap" plan in `lions-share-dashboard-2026-05-14.md` is superseded; Lion's Share gets the widget at v0.8, not at v1.
- The "wire Pivotal page-notes drawer first" interim step in Lion's Share is also superseded; no need to wire the Pivotal-shaped drawer at all.
- Pivotal's drawer + inbox imports change from local components to widget components. Schema doesn't move.
- The `feat-page-notes-overlap-tracking` branch in pivotal-replacement merges to main on its current shape; further evolution happens inside the widget.

## Open questions for Travis

1. Pivotal cutover risk: Cole is actively using page-notes in production. Phase 3 (cutover) should be timed so a regression doesn't surprise him during a live call. Suggest staging on a preview deploy first, then promoting after one full day of dogfooding. OK?
2. Lion's Share v0.8 dependency: the v0.8 plan in the Lion's Share thread already mentions widget ingestion. Cleanest path is to skip the localStorage-to-D1 intermediate step in Lion's Share and go straight to the widget adapter as the v0.8 deliverable. Approve?
3. Naming: the widget's primary export should be `<AnnotationWidget>` or stay branded as `<TravisEatsBugs>`? Marketing surface stays travisEATSbugs either way; just asking about the symbol consumers import. Recommend `<AnnotationWidget>` (generic) with the brand reserved for the marketing surface and skill names.
4. The 5 v0.1 issues currently in GH map to this phase 1; want me to refactor the issues to use the unified `Annotation` model (route + spatial anchor union) instead of the screenshot-first single-mode scope they currently describe? They're filed under different assumptions.
