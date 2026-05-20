# Design

travisEATSbugs is part of the Travis design family. This doc captures how the widget enforces the family's design canon and how downstream products (Theoria, travisFIXES, travisMAKES, plus any host install) recolor the widget for their own brand.

## Sources of truth

- **Family canon:** [memory/design-canon.md](../../memory/design-canon.md) (CODE monorepo). Authoritative. Reference before any new surface.
- **Voice canon:** [.claude/rules/voice.md](../../.claude/rules/voice.md). Authoritative for copy.
- **This doc:** how travisEATSbugs specifically applies the canon.

## Non-negotiable rules (canon-enforced)

1. **No-Shift Principle.** No interaction on the widget shifts host-page layout. Hover, focus, click, drag all use composite-only transforms (translate, scale, rotate). No border-thickness change, no padding/margin change on state, no font-weight change. Run the "click everything once" test before any release.

2. **`prefers-reduced-motion` kill switch.** MANDATORY on every animated property. The breathing glow, hover scale, drag momentum, all of it: zero on reduced motion. Already wired in `bug-mode.ts` and the playground stylesheet.

3. **No em dashes.** Anywhere. Code comments, docs, copy, commit messages. Use colons, periods, parens. The em-dash CI gate in `.github/workflows/ci.yml` enforces this.

4. **Easing:** `cubic-bezier(0.45, 0, 0.55, 1)` for ambient and hover. `cubic-bezier(0.16, 1, 0.3, 1)` for entrance reveals. 4-6s cycles on ambient motion.

5. **Mobile-first.** 44px minimum touch target, 48-52px on narrow viewports. The widget scales up on mobile, not down. No hover-dependent interactions on touch devices.

6. **Lightweight + portable.** Widget bundle target: <30KB gzipped including all v0.1 features. No heavy framework dependencies in the widget itself. The widget runs anywhere a `<script>` tag does.

## Color: role-based architecture

Per canon §0, color is not a fixed palette. Roles repeat, values change per host. The widget exposes these tokens as CSS custom properties on `:host` (Shadow DOM root). Host pages override by setting the same custom properties at `:root` or `body`. CSS custom properties pierce Shadow DOM boundaries.

### Widget theme tokens

```css
:host {
  --teb-signal: #ff2a6d;            /* primary accent, button background */
  --teb-signal-glow: rgba(255, 42, 109, 0.35);
  --teb-fg: #ffffff;                /* icon color on the button */
  --teb-shadow: rgba(0, 0, 0, 0.18);
  --teb-z: 2147483647;              /* top of stacking context */
  --teb-size: 48px;                 /* button diameter desktop */
  --teb-offset: 20px;               /* distance from edge */
  --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);
}
```

### Per-product theming examples

**Deep blue host theme:**
```css
:root {
  --teb-signal: #1a4d8f;            /* deep blue */
  --teb-signal-glow: rgba(26, 77, 143, 0.35);
}
```

**Gold host theme:**
```css
:root {
  --teb-signal: #c9a449;            /* gold accent */
  --teb-signal-glow: rgba(201, 164, 73, 0.35);
}
```

**Theoria PWA:**
```css
:root {
  --teb-signal: #7a5fa8;            /* purple-mid */
  --teb-signal-glow: rgba(122, 95, 168, 0.35);
}
```

**Default (no override):** the widget ships with Travis signal pink. Hosts who care recolor. Hosts who don't get a tasteful default that holds up against any background.

## Brand scope rule

Per Travis's design decision on 2026-05-14: **per-product visual canon**. Each brand (Theoria, travisFIXES, travisMAKES, travisEATSbugs marketing surface, plus any host install) keeps its own distinct visual identity. They share architectural roles and easing curves, not concrete values.

This means:
- The widget recolors per host. It does NOT impose travisFIXES pink on any other install.
- The marketing site at `eats.travisfixes.com` is a travisFIXES property and follows the travisFIXES signature (warm void + signal pink + grain + crosshair cursor).
- Documentation pages, playground, and example integrations show the widget recolored to each downstream brand to demonstrate flexibility.

## The sticky-note pin (v0.1+)

The pin is the differentiating UX layer. No OSS project ships this well today. Build from primitives per canon §11 motion canon + §5e flourish moves:

- CSS `transform: rotate(<deterministic-from-pin-id>deg)` for individual tilt. Deterministic so pins don't reshuffle on re-render.
- Paper-texture SVG noise overlay (canon §1a fractalNoise pattern at higher opacity).
- Motion `whileHover` for lift-and-tilt. Cap at scale 1.04 (canon §17c).
- Motion `whileDrag` + `dragMomentum` for physics-based reposition.
- Color-coded by pin kind:
  - **bug:** `--teb-signal` (host's signal color)
  - **idea:** `--teb-secondary` (typically blue or teal in host's palette)
  - **question:** `--teb-tertiary` (typically gold or purple)
  - **praise:** `--teb-success` (typically green)
- Themeable so each downstream product overrides all four.

## Voice (widget UI copy)

Per canon §12, voice signatures the widget can use:

- Form success: "Signal received." (after submitting a bug, in the host's success color, replacing the form per canon §7a)
- Empty state: "Nothing pinned here yet."
- Loading: nothing. No spinners (canon §17c: "spinners read as 'didn't think about loading'"). Use skeleton or blur-up.
- Error: short, declarative. "That didn't go through. Try again." NOT "Oops! Something went wrong."

## Accessibility

- All interactive elements have `aria-label`.
- The bug button uses `aria-pressed` to communicate mode state.
- Focus rings via `:focus-visible` with `outline: 2px solid var(--teb-fg)` and `outline-offset: 3px`.
- Color contrast: signal-on-bg ≥ 4.5:1 minimum. Test each host's recolor before approving.
- `prefers-reduced-motion` kills all animation.
- Keyboard navigation through all flows. The widget must be operable without a mouse.
- Screen-reader testing on every release (VoiceOver, NVDA at minimum).

## Anti-patterns (do NOT ship in this widget)

Per canon §11 plus widget-specific:

- Glassmorphism stacked on glassmorphism on the pin.
- Gradient mesh hero on the marketing site.
- Inter for the headline on the marketing site (use Unbounded).
- Animated counter stats on the marketing site.
- Generic 3-col rounded-2xl card grids.
- "Hope this helps" / "Oops!" / "Let's build the future together" microcopy.
- A spinner anywhere.
- A loading screen on the widget itself. The widget should render the first paint of its UI within one frame of `init()`.
- Color flash on click (canon §17c: "scale-down to 0.97 / 80ms / no color flash").

## Audit checklist (before each release)

- [ ] No em dashes in the diff
- [ ] `prefers-reduced-motion` kills every new animation
- [ ] No layout shift on any new hover/focus/active state (click-everything-once test)
- [ ] All new interactive elements have `aria-label` and visible focus state
- [ ] Touch targets ≥ 44px on every viewport
- [ ] No spinner introduced
- [ ] No "Oops!" / "Hope this helps" / "Let's build the future" copy
- [ ] Bundle size delta < 5KB gzipped (or justified in PR)
- [ ] Tested on the three reference recolors (deep blue, gold, default pink)
