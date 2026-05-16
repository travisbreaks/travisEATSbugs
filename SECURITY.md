# Security policy

## Supported versions

travisEATSbugs is pre-1.0. Only `main` receives security updates while the API stabilizes.

| Version | Supported |
|---|---|
| `main` (latest commit) | ✅ |
| Tagged releases | ✅ (current major only once tags begin) |
| Forks / older snapshots | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email `security@travisfixes.com` with:

- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept code, repro repo, or screen recording)
- Affected version (commit SHA or `0.0.x` release tag)
- Your assessment of impact

Initial response: within 72 hours. Patch timeline depends on severity:

| Severity | Target |
|---|---|
| Critical (RCE, auth bypass, data exfiltration at scale) | 7 days |
| High (XSS, CSRF, privilege escalation) | 30 days |
| Medium / Low | Best effort; tracked on the public roadmap once a fix lands |

Credit: reporters are listed in the release notes for the patch, unless you'd rather stay anonymous.

## Known scope of the widget

The widget runs in a Shadow DOM and reads from the surrounding document to build annotations. By design it captures:

- Page URL + pathname
- The clicked element's CSS selector + XPath + visible text (60 char excerpt)
- Browser + OS + viewport size + locale (env metadata only; no identifiers)
- Optional screenshot (`modern-screenshot` against the visible viewport)

It never reads form values, cookies, `localStorage` of the host page, or any cross-origin content. The widget's own `localStorage` namespace is scoped under `teb-` keys.

If you find behavior outside that envelope, treat it as a vulnerability and report it.
