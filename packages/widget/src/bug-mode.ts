/**
 * v0: toggle a floating brand-mark button in the bottom-right of the page.
 *
 * Design canon (memory/design-canon.md):
 * - No-Shift Principle: hover/active states only mutate non-layout properties
 *   (color, background, opacity, transform). Transforms are composite, not layout.
 * - Easing: cubic-bezier(0.45, 0, 0.55, 1) "smooth like butter" for ambient.
 * - Hover scale capped at 1.03 (1.02-1.04 tasteful range).
 * - Click feedback: scale 0.97, 80ms, no color flash.
 * - prefers-reduced-motion kill switch MANDATORY.
 * - Theme tokens exposed via CSS custom properties so host pages can recolor.
 * - Button shape: rounded square (matches the travisEATSbugs brand mark).
 * - Default colors: cream button background with dark brand mark (monochrome).
 *
 * v0.1 will add: anchor system, screenshot capture, sticky-note pin UI,
 * store adapter, AI triage webhook.
 */

export interface InitOptions {
  project?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /**
   * Fired on every click of the floating bug button, after the internal
   * active state flips. Closes the "consumer wires this manually for v0.1"
   * deferral: now you can pass `onToggle: () => widget.toggle()` instead
   * of attaching a click listener to the shadow root.
   */
  onToggle?: (isActive: boolean) => void
}

const HOST_ID = 'travisEATSbugs-host'

// Brand mark: the electric bug from brand/bug-electric.svg, minified.
// Mask ID renamed to avoid host-page collisions even though Shadow DOM scopes IDs.
const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 428 441" aria-hidden="true"><defs><mask id="teb-bug-mask" maskUnits="userSpaceOnUse"><path fill="#fff" d="M0 0h428v441H0z"/><path d="M259.249 335.877c1.75 2.354 3.84 4.508 3.434 7.66-.372 2.884-1.507 5.713-4.653 7.041-4.148 1.751-7.341-.659-9.488-3.415-3.193-4.098 1.637-7.153 1.711-10.624l.889-42.009c.076-3.594 1.284-5.99 3.738-8.467l13.946-14.077-.345-28.605c-3.876-2.181-7.837-5.184-8.773-8.692-1.325-4.968-1.004-9.879 1.968-13.428 2.733-3.263 6.459-5.075 10.397-4.984 3.784.087 7.675 1.876 9.932 5.27 4.677 7.035 2.284 15.922-5.094 20.164l-.188 31.442c-.018 3.007-2.564 5.355-4.477 7.253l-11.264 11.172c-1.31 1.3-1.815 2.92-1.811 4.886l.08 39.411Zm7.453-104.142c1.697 2.43 4.003 3.514 6.509 2.646 1.558-.54 3.334-1.996 3.565-4.24.181-1.757-.721-4.128-2.642-5.264-2.043-1.209-4.468-.54-6.058.971-1.328 1.263-2.68 4.016-1.374 5.886ZM156.31 155.092c3.259-6.186 9.853-8.729 16.352-5.998l10.593-10.396c1.106-1.085 2.765-.991 4.218-.98l51.283.409c1.841.015 4.556-.301 5.891.979l10.269 9.849c4.2-.899 8.935-1.043 12.47 1.46 4.87 3.447 6.895 8.803 5.532 14.236-1.26 5.021-5.816 8.82-11.325 9.19-5.427.364-10.491-3.109-12.733-8.522-1.434-3.464-.195-7.282.056-10.542-1.969-3.533-5.856-6.24-8.69-9.142l-30.176-.286-23.188.148-8.237 8.095 1.161 5.697c1.107 5.43-2.392 10.695-7.422 12.978-4.688 2.127-10.194 1.218-14.137-2.801-3.51-3.578-4.467-9.531-1.916-14.374Zm109.311 7.672c1.063-3.089-.792-5.917-3.18-6.733-2.718-.929-5.462 1.016-6.418 3.101-1.351 2.946.39 5.55 2.432 6.537 3.027 1.462 6.083.242 7.166-2.905m-102.971-.403c.682 3.429 4.106 4.389 6.881 3.145 2.513-1.126 3.568-3.671 2.725-6.816-.72-2.691-3.753-3.539-6.341-2.808-2.462.695-3.899 3.292-3.265 6.479m6.61 134.105c.004-1.966-.501-3.586-1.811-4.886l-11.264-11.172c-1.913-1.898-4.459-4.246-4.477-7.253l-.188-31.442c-7.378-4.242-9.772-13.13-5.094-20.164 2.257-3.394 6.148-5.183 9.932-5.27 3.938-.091 7.663 1.721 10.397 4.984 2.973 3.549 3.294 8.46 1.968 13.428-.936 3.509-4.897 6.511-8.773 8.692l-.345 28.605 13.946 14.077c2.454 2.477 3.662 4.873 3.738 8.467l.889 42.009c.073 3.472 4.904 6.526 1.711 10.624-2.147 2.756-5.34 5.166-9.488 3.415-3.146-1.328-4.281-4.157-4.653-7.041-.406-3.153 1.683-5.307 3.434-7.66l.08-39.411Zm-8.907-70.617c-1.59-1.512-4.015-2.18-6.058-.971-1.921 1.136-2.822 3.507-2.642 5.264.231 2.244 2.006 3.701 3.565 4.24 2.506.868 4.812-.216 6.509-2.646 1.306-1.871-.046-4.624-1.374-5.886Z"/></mask></defs><g fill="currentColor" mask="url(#teb-bug-mask)"><path d="M147.488 42.402c11.812 1.756 22.613 6.673 32.133 13.865C188.065 63.054 194.157 71.361 199 81l1.254-.429c4.621-1.465 8.79-1.887 13.621-1.821l2.111.011c5.223.088 10.005.68 15.014 2.239l.562-2.438c1.632-4.908 5.196-8.638 8.438-12.562l1.336-1.817c5.829-7.614 14.843-13.324 23.601-17.058 8.72-3.468 18.587-5.841 28-5.469 2.067.344 3.383.758 5.125 1.906 1.299 1.308 1.911 2.371 2.594 4.086.435 1.917.575 3.399.344 5.352-.997 2.062-2.2 3.585-4 5-2.551 1.004-4.897 1.137-7.632 1.238-9.996.409-18.557 2.704-27.118 7.949-7.714 5.038-12.986 11.79-17.535 19.77Q244 89 244.218 90.945c1.289 3.388 3.026 6.518 4.723 9.715Q250 103 250 106l-1.478-.26Q229.41 102.407 221 102l-1.478-.083c-10.543-.524-20.726 1.084-31.119 2.719-3.46.524-6.928.955-10.403 1.364a566 566 0 0 1 1.812-4.75l1.02-2.672Q182 96 183.699 93.984L185 92c-.237-4.577-2.517-8.025-4.939-11.761-5.098-7.532-11.589-12.321-19.636-16.338-6.929-3.262-13.398-4.22-20.996-4.38-3.126-.131-5.563-.356-8.304-1.943Q129 56 127.625 54.187c-.714-2.497-.79-4.206-.207-6.726.638-1.603 1.252-2.601 2.457-3.836 5.052-3.43 11.889-1.93 17.613-1.223"/><path d="M87 106c2.635 1.938 4.846 4.24 7.113 6.59l1.985 1.999a802 802 0 0 1 5.163 5.27c1.749 1.794 3.516 3.571 5.28 5.35 2.569 2.602 5.137 5.205 7.687 7.826l1.553 1.592Q117 136 118 138q.12 1.607.114 3.532v2.183l-.015 2.355-.005 2.413c-.005 2.547-.018 5.095-.031 7.642l-.013 5.176q-.017 6.35-.049 12.699h15l.281-3.984c.555-4.929 2.034-8.847 4.219-13.266l1.074-2.217c6.161-12.356 14.9-25.522 26.426-33.533 17.502-9.482 38.731-10.662 58.19-10.141 13.128.657 27.299 3.357 38.935 9.703 12.284 7.991 21.177 20.111 27.762 33.04 3.203 6.594 6.113 12.976 6.113 20.398h14l-.143-3.146a569 569 0 0 1-.351-11.686 256 256 0 0 0-.185-5.033q-.607-13.323 1.411-17.736c1.888-2.854 4.306-5.027 6.911-7.216 1.946-1.697 3.678-3.571 5.442-5.453 1.857-1.974 3.76-3.901 5.664-5.829q1.455-1.48 2.893-2.975a452 452 0 0 1 4.276-4.367l1.279-1.348c1.691-1.679 3.088-2.961 5.36-3.755q1.593-.315 4.443-.456c2.807 1.24 4.643 2.666 6.875 4.75 1.116 2.233 1.36 3.088 1.25 5.5-.907 4.153-3.237 6.579-6.017 9.688-2.111 2.065-4.252 3.65-6.694 5.304-4.997 3.632-9.645 7.326-12.658 12.833-3.484 8.875-2.175 20.126-1.789 29.462l.096 2.761q.106 2.599.31 5.192l.114 2.373.151 2.062q-.638 2.075-1.701 3.349c-2.172 2.01-3.985 3.501-6.905 4.191-2.317.179-4.589.202-6.913.17l-2.676.024c-2.438.016-4.875.01-7.313-.005-2.634-.012-5.268.006-7.902.02-5.155.022-10.309.017-15.464.002q-6.285-.015-12.571-.007l-1.809.002-3.638.005c-11.366.015-22.731-.002-34.097-.029a6334 6334 0 0 0-29.241.005c-11.325.027-22.651.037-33.976.022l-3.625-.005c-.594 0-1.189 0-1.801-.002-4.185-.005-8.369.003-12.553.014q-7.651.024-15.302-.016a700 700 0 0 0-7.803-.002c-2.823.014-5.644-.003-8.467-.028l-2.481.034c-3.142-.054-5.509-.15-8.26-1.753-1.535-1.23-2.881-2.405-4.14-3.916q-.598-2.034-.392-4.042l.172-2.315.259-2.475q.16-2.663.297-5.327l.155-2.802q.935-19.961-2.548-27.251c-4.772-7.524-11.887-13.489-19.083-18.635-2.542-1.844-3.748-2.929-5.191-5.816-.767-2.678-.793-4.248-.216-6.915q.547-1.422 2.422-3.734 2.125-1.688 3.5-2.5c2.742-.317 5.051-.137 7.625.812Zm65.312 98.707q2.37.009 4.741.013c4.137.011 8.273.041 12.409.074 4.23.031 8.46.044 12.69.059q12.424.051 24.848.147c1.312 7.548 1.141 15.119 1.129 22.75q.001 2.232.005 4.462.006 6.031 0 12.062-.002 6.325.001 12.65.003 10.619-.005 21.236-.008 12.261.002 24.523.006 10.545.002 21.091c0 4.193-.002 8.387.002 12.581q.004 5.913-.005 11.827v4.33q.004 2.965-.006 5.93l.007 1.713c-.019 4.016-.481 7.884-1.133 11.845-7.065-.436-13.372-1.715-20.063-4l-2.739-.928c-12.47-4.388-24.223-10.324-34.198-19.072l-2.219-1.789c-9.241-7.69-15.951-17.239-20.781-28.211l-1.653.551L108.999 324l.02 1.865q.09 8.716.135 17.433c.016 2.988.037 5.975.071 8.962q.048 4.329.058 8.656.008 1.648.033 3.296.121 8.542-.935 11.543c-2.921 5.074-8.64 8.055-13.382 11.245l-2.391 1.617a841 841 0 0 1-6.638 4.429q-1.34.887-2.673 1.779a419 419 0 0 1-3.822 2.515l-2.247 1.48c-2.437 1.29-4.504 1.822-7.229 2.18-2.846-.745-5.209-2.281-7.376-4.25-.819-2.294-1.012-4.417-1.183-6.836.6-2.058 1.17-2.79 2.621-4.324 3.174-2.97 6.732-5.302 10.375-7.653l1.947-1.275a799 799 0 0 1 3.803-2.475 246 246 0 0 0 6.571-4.486q1.242-.701 3.242-.701l-.021-1.941q-.09-9.07-.135-18.14-.022-4.663-.071-9.325-.048-4.503-.058-9.006a356 356 0 0 0-.033-3.429 336 336 0 0 1-.023-4.818l-.02-2.766c.457-3.266 1.468-4.89 3.361-7.575q1.634-1.223 3.406-2.063l2.008-.976 2.086-.961 1.992-.961c5.791-2.774 11.663-5.383 17.508-8.039l-3-35q-13.32-1.567-18 0c-3.964 3.583-5.512 8.992-7.23 13.913-1.109 3.003-2.578 5.741-4.146 8.524l-1.398 2.622L84.999 291c-2.682 1.341-4.861 1.229-7.827 1.187-3.453-.297-6.429-1.396-9.631-2.671l-2.029-.779q-2.101-.812-4.197-1.644a475 475 0 0 0-6.424-2.476q-2.05-.798-4.1-1.601l-1.931-.733c-2.896-1.169-4.607-2.001-6.731-4.358-1.279-2.178-1.985-3.386-2.13-5.925.688-2.533 1.633-4.759 3-7q1.812-1.438 4-2c4.383-.248 7.292.23 11.398 1.969l1.454.605c1.512.632 3.017 1.279 4.522 1.926q1.549.652 3.098 1.301A993 993 0 0 1 74.999 272l.515-1.672c1.755-5.499 3.883-10.617 6.485-15.766l1.039-2.138 1.023-2.045.91-1.826q1.028-1.553 2.281-2.736c2.489-1.165 4.922-1.193 7.621-1.266l1.715-.066q1.79-.066 3.58-.118c1.825-.054 3.648-.125 5.471-.197q1.743-.062 3.484-.119l1.648-.063c2.611-.07 4.816-.059 7.228 1.012l.135-2.184c.172-2.705.361-5.409.554-8.113q.122-1.746.23-3.494.801-12.883 4.081-18.209c1.802-2.508 3.797-4.283 6.451-5.866 7.254-3.219 15.097-2.508 22.861-2.427ZM221 205q72 0 80 3c2.711 1.926 4.381 4.1 6 7 1.179 3.605 1.599 7.245 2 11q.276 2.356.555 4.711c.513 4.426.989 8.856 1.445 13.289l2.824-.035c4.06-.037 8.117-.015 12.176.035l1.906.018c1.742.028 3.478.092 5.219.17l1.573.017c2.073.122 3.833.505 5.608 1.603 4.333 3.803 6.282 9.194 8.506 14.38q.615 1.386 1.233 2.771Q353 269.689 353 272l2-.842a717 717 0 0 1 7.442-3.058q1.605-.657 3.203-1.33 9.982-4.203 14.453-3.653c2.323.512 3.236 1.12 5.277 2.571 1.346 1.915 2.042 3.008 2.625 5.187.153 1.814.077 2.944-.642 4.63-1.39 2.195-2.646 4.013-4.818 5.485-1.699.839-3.406 1.546-5.177 2.221l-1.936.781a312 312 0 0 1-4.052 1.588 329 329 0 0 0-6.115 2.447c-6.096 2.437-11.784 4.606-18.439 4.561-2.125-.686-3.389-1.748-4.892-3.385-1.568-2.03-2.64-4.268-3.691-6.59l-.715-1.522a689 689 0 0 1-2.211-4.779q-1.117-2.406-2.242-4.81-.696-1.49-1.382-2.985Q330.11 265.11 329 264a57 57 0 0 0-4.035-.098l-2.451.01-2.576.026-2.588.013q-3.175.018-6.35.049l-.06 1.905Q310.175 288.996 308 300l1.371.375c5.682 1.719 11.046 4.038 16.441 6.5l2.246.992 2.149 1 1.921.879c1.965 1.316 3.671 2.599 5.099 4.502 1.611 3.652 1.169 7.749 1.045 11.666a210 210 0 0 0-.078 5.087 651 651 0 0 1-.231 14.453Q337.529 361.614 339 368c1.322 2.422 2.767 3.865 5.086 5.34a42 42 0 0 0 4.52 2.091c1.989.812 3.685 1.978 5.46 3.178a443 443 0 0 0 5.319 3.231c2.552 1.583 4.317 2.709 5.99 5.242.697 2.139 1.088 4.136 1.008 6.395-.481 1.913-1.239 2.887-2.571 4.335-1.7 1.463-3.062 2.303-5.124 3.25-4.126-.095-7.135-2.059-10.688-4.062-3.598-2.252-7.114-4.615-10.625-7q-2.068-1.394-4.138-2.784a684 684 0 0 1-2.648-1.797c-1.811-1.235-3.624-2.44-5.502-3.571l-1.61-.973-1.334-.758c-1.802-1.761-2.333-3.752-3.143-6.117q-.241-2.499-.227-5.157v-1.48c0-1.597.017-3.193.033-4.789l.008-3.341q.014-4.377.05-8.754c.02-2.983.029-5.967.039-8.95q.034-8.764.098-17.529l-2.799-.919c-2.17-.724-4.304-1.48-6.412-2.37l-1.582-.664-1.582-.672-1.652-.695q-1.987-.838-3.973-1.68l-.809 2.672c-1.04 3.105-2.474 5.834-4.253 8.578l-.919 1.423c-8.982 13.505-21.495 24.079-35.956 31.293-12.603 6.008-24.032 9.758-38.063 11.034z"/></g></svg>`

let hostElement: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let isActive = false
let onToggleHandler: ((isActive: boolean) => void) | null = null

function buildButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Open travisEATSbugs feedback')
  btn.setAttribute('aria-pressed', 'false')
  btn.title = 'Send feedback'
  // Inner wrapper so we can stack ambient rotation/translate on .mark without
  // overriding the button's hover/active scale transforms.
  btn.innerHTML = `<span class="mark" aria-hidden="true">${BRAND_MARK_SVG}</span>`
  return btn
}

function buildStyles(position: NonNullable<InitOptions['position']>): HTMLStyleElement {
  const style = document.createElement('style')
  const offsets: Record<typeof position, string> = {
    'bottom-right': 'bottom: var(--teb-offset); right: var(--teb-offset);',
    'bottom-left': 'bottom: var(--teb-offset); left: var(--teb-offset);',
    'top-right': 'top: var(--teb-offset); right: var(--teb-offset);',
    'top-left': 'top: var(--teb-offset); left: var(--teb-offset);',
  }
  style.textContent = `
    :host {
      /* Theme tokens. Host pages override via :root or body custom properties. */
      --teb-bg: #ffffff;
      --teb-fg: #0c0908;
      --teb-shadow: rgba(0, 0, 0, 0.22);
      --teb-glow: rgba(255, 42, 109, 0.35);
      --teb-z: 2147483647;
      --teb-size: 48px;
      --teb-radius: 12px;
      --teb-offset: 22px;
      --teb-ease: cubic-bezier(0.45, 0, 0.55, 1);

      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    @media (max-width: 640px) {
      :host {
        --teb-offset: 18px;
        --teb-size: 52px;
      }
    }

    button {
      position: fixed;
      ${offsets[position]}
      z-index: var(--teb-z);
      width: var(--teb-size);
      height: var(--teb-size);
      border-radius: var(--teb-radius);
      border: none;
      background: var(--teb-bg);
      color: var(--teb-fg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      box-shadow:
        0 4px 14px var(--teb-shadow),
        0 0 0 1px rgba(0, 0, 0, 0.04),
        0 0 0 0 var(--teb-glow);
      transition:
        transform 200ms var(--teb-ease),
        box-shadow 400ms var(--teb-ease);
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      isolation: isolate;
      animation: teb-breathe 5400ms var(--teb-ease) infinite;
    }

    /* Electric pulse ring: radial gradient pseudo-element, dormant
       until hover. Composite-only (transform+opacity), pierces nothing. */
    button::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: calc(var(--teb-radius) + 2px);
      background: radial-gradient(
        circle at 50% 50%,
        var(--teb-glow) 0%,
        transparent 65%
      );
      opacity: 0;
      transform: scale(0.85);
      transition:
        opacity 320ms var(--teb-ease),
        transform 480ms var(--teb-ease);
      pointer-events: none;
      z-index: -1;
    }

    /* .mark wraps the SVG so we can stack ambient transforms here without
       fighting the button's hover/active scale. Sticky-note wiggle: small
       continuous sway, then a punchy three-frame twitch at the 88-94% mark. */
    .mark {
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      transform-origin: 50% 60%;
      animation: teb-sticky 4800ms var(--teb-ease) infinite;
      will-change: transform;
    }

    button svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    button:hover {
      transform: scale(1.03);
      box-shadow:
        0 8px 22px var(--teb-shadow),
        0 0 0 1px rgba(0, 0, 0, 0.06),
        0 0 0 8px var(--teb-glow);
      animation-play-state: paused;
    }

    button:hover::before {
      opacity: 1;
      transform: scale(1.12);
    }

    button:hover .mark {
      animation-play-state: paused;
    }

    button:active {
      transform: scale(0.97);
      transition: transform 80ms var(--teb-ease);
    }

    button:focus-visible {
      outline: 2px solid var(--teb-fg);
      outline-offset: 3px;
    }

    button[aria-pressed='true'] {
      background: var(--teb-fg);
      color: var(--teb-bg);
      animation: none;
    }

    button[aria-pressed='true'] .mark {
      animation: none;
      transform: rotate(0deg);
    }

    /* Breathing glow ambient: shadow halo expands + contracts.
       Box-shadow only, no layout impact. 5.4s smooth-like-butter cycle. */
    @keyframes teb-breathe {
      0%, 100% {
        box-shadow:
          0 4px 14px var(--teb-shadow),
          0 0 0 1px rgba(0, 0, 0, 0.04),
          0 0 0 0 var(--teb-glow);
      }
      50% {
        box-shadow:
          0 6px 18px var(--teb-shadow),
          0 0 0 1px rgba(0, 0, 0, 0.06),
          0 0 0 5px var(--teb-glow);
      }
    }

    /* Sticky-note wiggle: lively but not seizure-y. Cycle of small
       sways with a punchy three-frame twitch at 88-94% so the bug
       "notices" something. Transform-only, applied to .mark wrapper.
       4.8s total cycle so it feels responsive without being annoying. */
    @keyframes teb-sticky {
      0% { transform: rotate(-3deg) translate(0, 0); }
      18% { transform: rotate(2.5deg) translate(0.5px, -0.5px); }
      35% { transform: rotate(-2deg) translate(-0.5px, 0); }
      52% { transform: rotate(3deg) translate(0, -0.5px); }
      70% { transform: rotate(-1.5deg) translate(0, 0); }
      85% { transform: rotate(0deg) translate(0, 0); }
      88% { transform: rotate(-8deg) translate(-1px, -0.5px); }
      91% { transform: rotate(6deg) translate(1px, 0); }
      94% { transform: rotate(-4deg) translate(0, 0); }
      100% { transform: rotate(-3deg) translate(0, 0); }
    }

    /* MANDATORY per design-canon §9a. Kill every ambient. */
    @media (prefers-reduced-motion: reduce) {
      button,
      button::before,
      .mark {
        animation: none !important;
        transition: none !important;
      }
      .mark {
        transform: none;
      }
      button::before {
        opacity: 0;
        transform: none;
      }
      button:hover,
      button:active {
        transform: none;
      }
    }
  `
  return style
}

export function init(options: InitOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }
  if (hostElement) {
    return
  }
  const position = options.position ?? 'bottom-right'
  onToggleHandler = options.onToggle ?? null
  hostElement = document.createElement('div')
  hostElement.id = HOST_ID
  shadowRoot = hostElement.attachShadow({ mode: 'open' })
  shadowRoot.appendChild(buildStyles(position))
  const btn = buildButton()
  btn.addEventListener('click', toggle)
  shadowRoot.appendChild(btn)
  document.body.appendChild(hostElement)
}

export function toggle(): void {
  isActive = !isActive
  const btn = shadowRoot?.querySelector('button')
  if (btn) {
    btn.setAttribute('aria-pressed', String(isActive))
  }
  if (onToggleHandler) {
    try {
      onToggleHandler(isActive)
    } catch {
      // Host callback threw; swallow so the button state stays consistent
      // with what was rendered. Consumers can wire their own try/catch.
    }
  }
}

export function destroy(): void {
  if (hostElement?.parentNode) {
    hostElement.parentNode.removeChild(hostElement)
  }
  hostElement = null
  shadowRoot = null
  isActive = false
  onToggleHandler = null
}
