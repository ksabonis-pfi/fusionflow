-- Project Internal Notes: a PM progress/status log that lives in CloudConnect.
-- The row here is the record; a copy is pushed to the linked CE case's
-- Internal Notes field (incident.new_internalnotes) best-effort, tracked by
-- ce_pushed_at/ce_push_error, but the note is never lost if that push fails.
CREATE TABLE project_internal_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ce_pushed_at TEXT,
  ce_push_error TEXT
);

CREATE INDEX idx_project_internal_notes_project ON project_internal_notes(project_id, created_at DESC);
