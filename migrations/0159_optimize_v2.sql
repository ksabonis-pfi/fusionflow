-- Optimizations V2: the Customer Optimization Program (11-layer scorecard,
-- findings, reports) folded in from the standalone Zoom and RingCentral apps.
-- Hangs off the existing optimize_accounts row (one per customer); V1 tables
-- are left untouched. See docs/optimize-v2/DESIGN.md.

-- One per account per platform. Credentials are a single AES-GCM encrypted JSON
-- blob (shape differs by platform) under the OPTIMIZE_ENC_KEY worker secret;
-- creds_hint holds only non-secret identifiers for display.
CREATE TABLE opt2_connections (
  id                  TEXT PRIMARY KEY,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('zoom', 'ringcentral')),
  creds_enc           TEXT,
  creds_hint          TEXT NOT NULL DEFAULT '{}',
  window_days         INTEGER NOT NULL DEFAULT 30,
  timezone            TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  assumptions         TEXT NOT NULL DEFAULT '{}',
  inputs              TEXT NOT NULL DEFAULT '{}',
  schedule_enabled    INTEGER NOT NULL DEFAULT 0,
  schedule_day        INTEGER NOT NULL DEFAULT 1,
  last_run_at         TEXT,
  last_error          TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (optimize_account_id, platform)
);

-- One assessment. Headline numbers are denormalized for lists and trends; the
-- full result (scorecard, findings, product reports, raw data) lives in R2.
CREATE TABLE opt2_runs (
  id                  TEXT PRIMARY KEY,
  connection_id       TEXT NOT NULL REFERENCES opt2_connections(id) ON DELETE CASCADE,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  from_date           TEXT NOT NULL,
  to_date             TEXT NOT NULL,
  source              TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'scheduled', 'imported')),
  overall             INTEGER,
  overall_grade       TEXT,
  config_alignment    REAL,
  indices             TEXT NOT NULL DEFAULT '[]',
  kpis_populated      INTEGER,
  kpis_total          INTEGER,
  api_populated       INTEGER,
  red_findings        INTEGER,
  amber_findings      INTEGER,
  potential_gain      REAL,
  subrequests_used    INTEGER,
  result_key          TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_opt2_runs_connection ON opt2_runs(connection_id, created_at);
CREATE INDEX idx_opt2_runs_account ON opt2_runs(optimize_account_id, created_at);

-- One row per KPI per run, for trend charts.
CREATE TABLE opt2_run_kpis (
  run_id        TEXT NOT NULL REFERENCES opt2_runs(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  layer         INTEGER NOT NULL,
  value         REAL,
  target        REAL,
  unit          TEXT,
  dir           TEXT,
  status        TEXT,
  attainment    INTEGER,
  mode          TEXT,
  available     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, key)
);
CREATE INDEX idx_opt2_run_kpis_trend ON opt2_run_kpis(connection_id, key, created_at);

-- Questionnaire answers: one per account, platform and instrument
-- (pre-sow | post-sow | optimization-review). Used from phase 3.
CREATE TABLE opt2_questionnaire_responses (
  id                  TEXT PRIMARY KEY,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  instrument          TEXT NOT NULL,
  answers             TEXT NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  progress            INTEGER NOT NULL DEFAULT 0,
  updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (optimize_account_id, platform, instrument)
);
