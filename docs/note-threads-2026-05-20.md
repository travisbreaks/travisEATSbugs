# TEB note threads: two-way per-note communication

**Status:** open. Captured from Travis 2026-05-20 (Pivotal-Cole context).
**Priority:** high. Real workflow gap surfaced from Pivotal use.
**Related:** `client-facing-tenancy.md` (control-plane work),
`per-host-theming-2026-05-20.md` (Phase 1 design docs).

## The need

Cole files notes via the widget on Pivotal. Some are unclear or ambiguous.
The admin (Travis / Cole's other team) needs to ask Cole a follow-up
question. Today that has to happen out-of-band (text, email, separate
thread). Then the answer has to be manually reconciled back to the note.

Same scenario applies for every TEB consumer: LSD asks an Acme team
member to clarify a bug; Travis asks Jesse to confirm a feature ask; a
client team's PM asks the original reporter to add a screenshot.

**The note should become a thread.** First message starts the thread.
Every subsequent message is a reply on the same thread. The reporter
gets pinged when there's a new reply. The admin sees the thread in the
inbox. Resolution happens at the thread level, not the message level.

## Data model

Single new table on the host's adapter schema:

```sql
CREATE TABLE page_note_messages (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES page_notes(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NULL,
  -- Optional: structured fields the admin UI may want
  is_admin_message INTEGER DEFAULT 0,   -- vs. reporter reply
  attachment_r2_path TEXT NULL          -- screenshot/file reply
);
CREATE INDEX idx_page_note_messages_note ON page_note_messages(note_id, created_at);
```

The original note row stays as-is. The first message of the thread is
just the note body. Subsequent replies are rows in `page_note_messages`
referencing the note. The inbox displays note + thread as a single
conversational unit.

Backwards-compatible: existing notes without replies just show as a
zero-reply thread.

## UX patterns

### Inbox-side (admin)

- Note row shows reply count badge ("3 replies")
- Click row: expands to threaded view with reply box
- Admin posts a reply → reply persists → reporter gets notified
- Resolution actions (resolve / mark-fix-shipped / dup-of) stay at the
  note level, not per-message

### Widget-side (reporter)

- Reporter (Cole, or a client team member) sees their own notes via the
  widget's drawer list
- Note that has unread admin replies shows a badge (`!` or dot)
- Click note → see thread inline → reply with the widget's existing
  compose UI

### Notification dispatch

Reporter needs to know there's a reply. Three channels:

1. **In-app**: when the reporter loads the widget on the host site, an
   indicator surfaces unread replies. Pull-based, no infrastructure.
2. **Email**: outbound email via Resend (TEB cloud paid tier). Daily
   digest of unread replies per reporter, or real-time per-reply.
3. **iMessage / Slack / SMS**: future. Hook into the host's notification
   stack via webhook.

Phase A6 pilot uses #1 (in-app) only. Phase B1 adds #2. #3 is
post-MVP.

## OSS / paid split

**OSS (canonical TEB widget + worker + adapter)**:
- `page_note_messages` table in the reference schema
- Widget reads thread + posts replies via the same `ApiAdapter` interface
  (adapter gets two new methods: `listMessages(noteId)`, `addMessage(noteId, body)`)
- Playground demonstrates threaded view
- In-app indicator (the `!` dot on notes with unread replies)

**Paid (TEB cloud)**:
- Email notification dispatch (Resend integration)
- Per-reporter notification preferences (immediate vs. digest vs. off)
- Cross-channel webhook dispatch (Slack, iMessage relay, SMS)
- Mention syntax (`@username`) with email push to the mentioned user
- Reply via email (incoming email → posts as message via Resend inbound)

**Pivotal-internal**:
- Cole-specific notification preferences (text via iMessage relay?)
- Canon-lane-aware reply routing (W7-related replies route to finance person)

## Acceptance criteria

- Note in inbox shows reply count
- Admin can post reply via inbox UI
- Reporter loads widget → sees admin reply inline on their own note → can post reply
- Reporter without unread replies sees no indicator
- Resolution at note level closes the thread to new messages (or leaves it open per host config)
- Backwards-compat: existing notes with zero replies render fine
- Schema migration applies cleanly to Pivotal + LS schemas (both already have `page_notes` table; new table only)

## Effort estimate

- Schema migration + adapter methods: 1.5 hr
- Widget thread view + reply compose: 2-3 hr
- Inbox-side threaded UI (in `teb-cloud` Phase 3 paid tier): 4-5 hr
- In-app indicator + read/unread tracking: 1.5 hr
- Email dispatch (paid tier): 2-3 hr
- Tests + playground demo: 1.5 hr

Total OSS: ~6 hr. Paid-tier additions: ~3 hr.

## When this lands

Lands in TEB 0.0.x release once Phase 0 (hygiene) + Phase 1.6 (anchor
rehydration) are complete. Likely 0.0.12 or 0.0.13.

Email dispatch lands in `teb-cloud` Phase 3.7 (weekly digest cron grows
to handle real-time / digest reply email).
