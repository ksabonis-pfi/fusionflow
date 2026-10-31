-- Optimizations V2 phase 5: monthly scheduled runs and score trends.

-- When the scheduler last started a run for this connection (UTC). Limits a
-- failing connection to one scheduled attempt per local day.
ALTER TABLE opt2_connections ADD COLUMN schedule_attempted_at TEXT;

-- Per-layer scores for the run, JSON [{layer, label, score}], so the trend view
-- doesn't need the R2 result. Runs saved before this column fall back to
-- layer means derived from opt2_run_kpis.
ALTER TABLE opt2_runs ADD COLUMN layer_scores TEXT;
