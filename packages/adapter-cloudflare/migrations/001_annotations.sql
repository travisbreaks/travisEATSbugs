-- travisEATSbugs v0.2 schema, single migration. Consolidates the schema
-- evolution that Pivotal page-notes went through (mig 043 base + mig 045
-- resolution + mig 058 overlap) into one clean shape for the unified
-- Annotation type from packages/widget/src/types.ts.
--
-- Key shape differences vs Pivotal page_notes:
--   * Unified `anchor_mode` column (route | spatial) replaces the implicit
--     page_path-only model. Spatial-anchored annotations carry x/y % and a
--     surface_id; route-anchored ones can also carry a CSS selector,
--     W3C text-quote fields, and a viewport box for screenshot regions.
--   * `id` is TEXT not INTEGER (matches the widget's `local-${ts}-${rand}`
--     IDs and any UUIDs the host may pass in).
--   * Author is split into id + display + optional avatar URL (the
--     widget's AuthorRef shape) so the adapter doesn't need a join.
--   * Resolution + overlap fields land at v0.1 (inherited primitives from
--     Pivotal mig 045 + 058), not a later migration.
--   * Screenshot URL is reserved for v0.5; columns added now so v0.5
--     ships without another ALTER.
--
-- Indexes mirror Pivotal's query patterns: per-path-per-user list,
-- per-surface list, per-author timeline, inbox resolution sort, dup-of
-- reverse lookup.

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,

  -- Anchor (discriminated union per types.ts AnnotationAnchor)
  anchor_mode TEXT NOT NULL CHECK(anchor_mode IN ('route', 'spatial')),
  -- route-mode fields
  anchor_path TEXT,
  anchor_selector TEXT,
  anchor_text_quote_exact TEXT,
  anchor_text_quote_prefix TEXT,
  anchor_text_quote_suffix TEXT,
  anchor_viewport_x REAL,
  anchor_viewport_y REAL,
  anchor_viewport_w REAL,
  anchor_viewport_h REAL,
  -- spatial-mode fields
  anchor_surface_id TEXT,
  anchor_surface_kind TEXT CHECK(anchor_surface_kind IS NULL OR anchor_surface_kind IN ('screenshot', 'canvas')),
  anchor_x REAL,
  anchor_y REAL,

  -- Core fields
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_display TEXT NOT NULL,
  author_avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  modified_at INTEGER NOT NULL DEFAULT (unixepoch()),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'resolved')),
  severity TEXT CHECK(severity IS NULL OR severity IN ('low', 'medium', 'high')),

  -- Resolution (Pivotal mig 045 inheritance)
  resolved_pr INTEGER,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_note TEXT,

  -- Overlap (Pivotal mig 058 inheritance)
  related_ids TEXT,                              -- JSON array of annotation ids
  dup_of TEXT REFERENCES annotations(id),

  -- Screenshot (reserved for v0.5)
  screenshot_url TEXT,
  screenshot_w INTEGER,
  screenshot_h INTEGER
);

-- Route-mode list: drawer queries by current path + author scope.
CREATE INDEX IF NOT EXISTS idx_annotations_route
  ON annotations(anchor_path, author_id, created_at DESC);

-- Spatial-mode list: overlay queries by surface.
CREATE INDEX IF NOT EXISTS idx_annotations_spatial
  ON annotations(anchor_surface_id, created_at DESC);

-- Author timeline: triage inbox author-filter dropdown + per-user list.
CREATE INDEX IF NOT EXISTS idx_annotations_author
  ON annotations(author_id, modified_at DESC);

-- Inbox tabs (open/resolved): resolution sort.
CREATE INDEX IF NOT EXISTS idx_annotations_resolution
  ON annotations(resolved_at, resolved_pr);

-- "Find duplicates of note #N" reverse lookup.
CREATE INDEX IF NOT EXISTS idx_annotations_dup_of
  ON annotations(dup_of);

-- Optional audit log (the widget's audit hook can write here from the
-- adapter, but the table is independent and an absent log is fine).
CREATE TABLE IF NOT EXISTS annotation_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  fields_json TEXT,
  at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_annotation
  ON annotation_audit_log(annotation_id, at DESC);
