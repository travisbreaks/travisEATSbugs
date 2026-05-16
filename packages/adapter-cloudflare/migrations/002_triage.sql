-- v0.5 AI triage onCreate hook.
--
-- Adds columns for the structured-output result returned by Claude (or
-- whatever model the worker route is wired to). Stored alongside the
-- annotation so the inbox UI can sort / filter on `triage_severity` and
-- `triage_category` without a join, and so `triage_dupe_of` can be used
-- as a soft duplicate marker independent of the canonical `dup_of`
-- column (which is reserved for human-confirmed duplicates).
--
-- Indexes mirror inbox sort patterns: severity DESC for "biggest first",
-- category for grouping.

ALTER TABLE annotations ADD COLUMN triage_severity TEXT
  CHECK(triage_severity IS NULL OR triage_severity IN ('low', 'medium', 'high'));
ALTER TABLE annotations ADD COLUMN triage_category TEXT;
ALTER TABLE annotations ADD COLUMN triage_assignee TEXT;
ALTER TABLE annotations ADD COLUMN triage_dupe_of TEXT;
ALTER TABLE annotations ADD COLUMN triage_rationale TEXT;
ALTER TABLE annotations ADD COLUMN triage_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_annotations_triage_severity
  ON annotations(triage_severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_annotations_triage_category
  ON annotations(triage_category, created_at DESC);
