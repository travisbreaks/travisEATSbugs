# Client-Facing Tenancy — design scoping

**Status:** pre-build design doc (Phase A6 pilot + Phase B multi-tenant rollout)
**Date:** 2026-05-19
**Driver:** Lion's Share OS engagement letter
(`lionsshare.travisfixes.com/proposal/c72dc386/`) Phase A6 = single-client
pilot. Phase B (B1 + B2) = full multi-tenant rollout across LSD's client
portfolio.

## Purpose

Today the EATS-bugs widget is single-tenant: one host site (the dashboard
running it) IS the one place feedback lands. Internal teams use it to
file feedback to their own systems. Working great in that mode at LS OS
and the Pivotal mirror.

Lion's Share Digital wants the widget on THEIR CLIENTS' sites. Each
client's site is its own host environment; their visitors are the people
filing feedback; but the feedback should land back inside LSD's LS OS
under that client's management record, not on the client's own site.

That's a fundamentally different topology and forces seven design
decisions that this doc enumerates. Each decision has a recommended path
that the Phase A6 pilot will exercise + validate before Phase B1 scales
it across the portfolio.

## The seven decisions

### 1. Identity model for client end-users

**The question.** A visitor on `acme-corp.com` clicks the bug button.
Who are they?

**Options:**
- (a) **Anonymous + share-token.** No auth; widget includes a per-client
  embed token that scopes their feedback to that client tenant. Visitor
  identity = whatever they type in a "your name" field.
- (b) **Magic-link.** First time someone files feedback, they enter
  email; widget emails a magic link; subsequent feedback is tied to
  that authenticated identity.
- (c) **SSO with the client's existing auth.** Each client wires their
  own auth provider; widget reads the existing session. Heaviest lift.

**Recommendation:** (a) for Phase A6 pilot. Lowest friction. Reporter-mode
already exists in the widget. If LSD finds that anonymous feedback is
noisy/unactionable, B-phase can layer magic-link selectively per client.

### 2. Per-client routing

**The question.** A bug filed on Acme's site needs to land in LS OS at
`/clients/acme/page-notes-inbox` (or whatever the canonical surface is),
not in LSD's global inbox.

**Options:**
- (a) **Tenant ID in embed token.** Widget config has
  `{tenantId: "acme"}`; reporter payload includes it; LS OS
  page-notes-inbox filters by tenant.
- (b) **Subdomain-based routing.** Each client gets a feedback-receiver
  subdomain (e.g. `acme-feedback.lionsshare.travisfixes.com`) that the
  widget posts to. Tenant inferred from subdomain.
- (c) **Per-client adapter URL.** Widget config has
  `{adapterUrl: "https://lionsshare.../api/page-notes/acme"}`; explicit
  endpoint per client.

**Recommendation:** (a) — single endpoint, tenant ID in payload. Cheapest
to add/remove clients (no DNS, no per-client adapter deploys).

### 3. Embed pattern

**The question.** How does the widget get onto each client's site?

**Options:**
- (a) **Script tag.** Each client's site includes
  `<script src="https://assets.travisbreaks.com/eats-bugs.js"
  data-tenant="acme"></script>`. WordPress: drop into theme or use a
  small plugin.
- (b) **Per-client widget bundle.** LS OS serves a tenant-baked bundle
  at `lionsshare.../widget/<tenant>.js` with tenant ID compiled in.
  Same script-tag UX but no `data-` attribute.
- (c) **Plugin install.** Build a WPMU Dev plugin LSD installs across
  their managed sites.

**Recommendation:** (a) plus (c) eventually. (a) is universal and works
on non-WP sites too. (c) is the LSD-internal UX win — they can deploy it
across 45+ WP sites in minutes via WPMU Dev rather than touching theme
files.

### 4. Theming per client

**The question.** Does each client's widget match their brand, or stay
LSD-generic?

**Options:**
- (a) **No per-client theming.** Generic dark UI. Reads as "third-party
  feedback tool", not "Acme's feedback button."
- (b) **Brand color + logo per client.** Config includes `primaryColor`,
  `logoUrl`. Widget renders with those.
- (c) **Full theme override.** Per-client CSS bundle, fonts, copy.

**Recommendation:** (b) — primary color + logo per client. Reads like
the client's tool. Low-effort: extend the existing widget theme config to
read from tenant payload.

### 5. Multi-tenancy at the worker layer

**The question.** Where does tenant-scoped data live in the LS OS
adapter?

**Options:**
- (a) **Tenant-scoped tables.** All existing page-notes/feedback tables
  add a `tenant_id` column. Queries filter by tenant.
- (b) **Per-tenant D1 namespace.** Each client gets a logical D1 namespace
  inside the shared DB. Heaviest schema lift.
- (c) **Per-tenant worker.** Separate worker deploy per client. Strong
  isolation, high ops cost.

**Recommendation:** (a). Mirrors how the existing audit_log + tasks
tables are project-scoped; same pattern with `tenant_id`. Cheapest path
to N clients.

### 6. PR/fix linkage back to client portal

**The question.** When LSD ships a fix for an Acme-filed bug, does
anything tell Acme?

**Options:**
- (a) **No notification.** Status updates stay internal to LS OS.
- (b) **Email digest.** Weekly per-client digest of resolved feedback
  with optional fix descriptions.
- (c) **Status badge in the widget.** Visitors who filed feedback see a
  "fixed" indicator on their next visit (if magic-link identity is
  enabled). Requires Decision 1 = (b).
- (d) **Per-client client-facing portal.** Acme team gets a read-only
  view of their own feedback queue at `acme.lionsshare.travisfixes.com`
  or similar.

**Recommendation:** (b) for Phase A6 pilot. (d) is a Phase B+ upsell
opportunity; not in scope of this rollout.

### 7. Pricing surface for Jesse's clients

**The question.** Does Jesse charge his clients for this as a value-add
("we ship sites with built-in feedback tooling"), or absorb it as a
quality-of-life LSD-internal differentiator?

**Options:**
- (a) **Internal differentiator.** Bundled into every LSD engagement.
  No client-line-item.
- (b) **Add-on tier.** Clients pay LSD a monthly per-site fee for
  feedback tooling.
- (c) **Bundled with retainer.** Already-retained clients get it
  automatically; one-off project clients don't.

**Recommendation:** (c) for the cleanest commercial story. Bundled =
sticky retainer, generates ongoing signal for LSD's product roadmap, no
per-site billing complexity.

## Phase A6 pilot — what it actually delivers

One pilot client (Jesse picks during kickoff). Implements:
- Decision 1 (a): anonymous + share-token
- Decision 2 (a): tenant ID in embed token
- Decision 3 (a): script tag, manually placed on the pilot site
- Decision 4 (b): primary color + logo per client
- Decision 5 (a): tenant_id column added to page-notes tables
- Decision 6 (b): weekly digest email
- Decision 7: deferred (no charging during pilot)

End-state of A6: one of LSD's clients can file bugs/feedback from their
site; LSD sees those bugs scoped to that client's management page in LS
OS with the client's brand applied; LSD ships fixes; weekly digest goes
back to the client.

## Phase B rollout — what scales beyond the pilot

Phase B1 (multi-tenant rollout) takes the working A6 architecture and:
- Builds a tenant-management UI in LS OS (`/clients/<id>/widget-config`)
- Auto-provisions tenant IDs + embed snippets per client
- Optional WPMU Dev plugin (Decision 3 (c)) for one-click rollout to LSD's
  WordPress-hosted portfolio
- Per-client theming UI (color picker, logo upload)

Phase B2 (per-client theming + feedback aggregation) layers in:
- Aggregated cross-client feedback dashboard for LSD-internal use
- PR/fix linkage that flows resolution status back to per-client digest
- /Pack-level visibility into "which clients have unresolved feedback"

## Open questions for Travis (pre-A6)

1. **Reporter-mode evolution.** The widget's existing reporter-mode is
   single-tenant. Does A6 piggyback on reporter-mode and add tenant_id, or
   does A6 spin a separate "client-facing mode" with its own surface?
2. **Asset hosting for tenant-specific theme assets.** Logo + brand color
   per tenant — does that live in R2, in D1 as base64, or fetched
   live from each client's site?
3. **Embed bundle versioning.** When the widget code updates, do all
   tenants auto-roll forward, or do tenants pin a version?
4. **Anonymous abuse.** Anonymous mode means anyone-on-the-internet can
   spam the widget. Rate limit per-IP + per-tenant? Captcha? Just trust
   for the pilot and revisit if it becomes a problem?

These don't block writing the doc. They block writing the code. Sequence
them into the Phase A6 kickoff conversation.
