-- AI Agent ROI Builder: shared saved scenarios (replaces the per-browser
-- localStorage list). Every Sales Tools user can list and open every scenario;
-- only the owner or an admin can update or delete one. Anyone can duplicate.
--
-- inputs_json is the RoiInputs object (validated by roiInputsSchema on write).
-- client_name is denormalized from inputs.client for the list view.
-- model_version is the roiModel MODEL_VERSION the scenario was saved with;
-- figures are always recomputed with the current model on open.
--
-- updated_at is an ISO-8601 timestamp with milliseconds written by the worker
-- (not datetime('now'), which only has 1-second resolution) and doubles as the
-- optimistic-concurrency token for updates.
--
-- Soft delete: the list is shared and admins can delete other people's work,
-- so a mistaken delete can be undone by clearing deleted_at in D1. Nothing
-- else references these rows, so the cost is one extra predicate per query.
CREATE TABLE roi_scenarios (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_name    TEXT,
  name          TEXT NOT NULL,
  client_name   TEXT NOT NULL DEFAULT '',
  model_version TEXT NOT NULL,
  inputs_json   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  deleted_by    TEXT
);

CREATE INDEX idx_roi_scenarios_updated_at ON roi_scenarios(updated_at);
CREATE INDEX idx_roi_scenarios_owner ON roi_scenarios(owner_user_id);
