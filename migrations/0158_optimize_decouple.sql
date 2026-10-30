-- Decouple Optimize from Implementation.
--
-- Until now every Optimize account hung off a projects row: direct-enrolled
-- accounts got an empty "project shell" just to satisfy optimize_accounts.
-- project_id, and every Optimize child table was keyed by project. Those
-- shells leaked into project counts, dashboards and reports.
--
-- After this migration an Optimize account belongs to its customer (one per
-- customer) and carries its own vendor / solution types / go-live date.
-- Implementation projects that graduated are linked through
-- optimize_account_projects for history only. Optimize child tables are keyed
-- by optimize_account_id. Empty shells are deleted.
--
-- Two customers had two accounts each; they are merged into the earliest one.
-- creds_key keeps the id the account's Zoom / RingCentral credentials are
-- stored under in KV (zoom:creds:<id>, rc:creds:<id>) — the old project id for
-- existing accounts, the account id for new ones.

PRAGMA defer_foreign_keys = true;

-- ── 1. Map every existing account to its customer and the surviving account ──

-- Accounts whose project has no customer yet: link by CRM account first.
UPDATE projects
SET customer_id = (SELECT c.id FROM customers c WHERE c.crm_account_id = projects.dynamics_account_id LIMIT 1)
WHERE customer_id IS NULL
  AND dynamics_account_id IS NOT NULL
  AND id IN (SELECT project_id FROM optimize_accounts);

CREATE TABLE _oa_map AS
SELECT oa.id                                  AS old_id,
       oa.project_id                          AS project_id,
       COALESCE(oa.customer_id, p.customer_id) AS customer_id,
       oa.graduated_at                        AS graduated_at,
       oa.graduated_by                        AS graduated_by,
       NULL                                   AS new_id
FROM optimize_accounts oa
JOIN projects p ON p.id = oa.project_id;

-- Earliest account per customer survives. (An account whose customer still
-- can't be resolved gets no new_id and is dropped; production has none.)
UPDATE _oa_map SET new_id = (
  SELECT m2.old_id FROM _oa_map m2
  WHERE m2.customer_id = _oa_map.customer_id
  ORDER BY m2.graduated_at, m2.old_id
  LIMIT 1
)
WHERE customer_id IS NOT NULL;

-- ── 2. New optimize_accounts, keyed by customer ─────────────────────────────

CREATE TABLE optimize_accounts_v2 (
  id                TEXT PRIMARY KEY,
  customer_id       TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  vendor            TEXT,
  solution_types    TEXT NOT NULL DEFAULT '[]',
  go_live_date      TEXT,
  creds_key         TEXT,
  graduated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  graduated_by      TEXT REFERENCES users(id),
  graduation_method TEXT NOT NULL DEFAULT 'direct',
  optimize_status   TEXT NOT NULL DEFAULT 'active',
  next_review_date  TEXT,
  notes             TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO optimize_accounts_v2
  (id, customer_id, vendor, solution_types, go_live_date, creds_key,
   graduated_at, graduated_by, graduation_method, optimize_status,
   next_review_date, notes, created_at, updated_at)
SELECT
  oa.id, m.customer_id, p.vendor, COALESCE(NULLIF(p.solution_types, ''), '[]'), p.actual_go_live_date, oa.project_id,
  oa.graduated_at, oa.graduated_by, oa.graduation_method, oa.optimize_status,
  (SELECT MIN(x.next_review_date) FROM optimize_accounts x JOIN _oa_map mx ON mx.old_id = x.id
    WHERE mx.new_id = oa.id AND x.next_review_date IS NOT NULL AND x.next_review_date != ''),
  (SELECT group_concat(x.notes, char(10) || char(10)) FROM optimize_accounts x JOIN _oa_map mx ON mx.old_id = x.id
    WHERE mx.new_id = oa.id AND x.notes IS NOT NULL AND TRIM(x.notes) != ''),
  oa.created_at, oa.updated_at
FROM optimize_accounts oa
JOIN _oa_map m ON m.old_id = oa.id
JOIN projects p ON p.id = oa.project_id
WHERE m.new_id = oa.id;

DROP TABLE optimize_accounts;
ALTER TABLE optimize_accounts_v2 RENAME TO optimize_accounts;

-- ── 3. Child tables: re-key from project to Optimize account ────────────────
-- A row's account is its project's account, else its project's customer's
-- account (the one stray tech-stack row on a de-graduated project). Rows that
-- resolve to neither were already unreachable and are dropped.

CREATE TABLE _child_map AS
SELECT project_id, new_id AS account_id FROM _oa_map WHERE new_id IS NOT NULL
UNION
SELECT p.id, oa.id
FROM projects p
JOIN optimize_accounts oa ON oa.customer_id = p.customer_id
WHERE p.id NOT IN (SELECT project_id FROM _oa_map);

CREATE TABLE impact_assessments_v2 (
  id                   TEXT PRIMARY KEY,
  optimize_account_id  TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  survey_id            TEXT NOT NULL DEFAULT 'client_impact_assessment_unified_v1',
  conducted_date       TEXT NOT NULL,
  conducted_by_user_id TEXT REFERENCES users(id),
  solution_types       TEXT NOT NULL DEFAULT '[]',
  answers              TEXT NOT NULL DEFAULT '{}',
  section_scores       TEXT,
  solution_scores      TEXT,
  overall_score        INTEGER,
  confidence_score     INTEGER,
  health_band          TEXT,
  recommended_actions  TEXT,
  insights             TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO impact_assessments_v2
SELECT ia.id, cm.account_id, ia.survey_id, ia.conducted_date, ia.conducted_by_user_id,
       ia.solution_types, ia.answers, ia.section_scores, ia.solution_scores,
       ia.overall_score, ia.confidence_score, ia.health_band, ia.recommended_actions,
       ia.insights, ia.created_at, ia.updated_at
FROM impact_assessments ia JOIN _child_map cm ON cm.project_id = ia.project_id;
DROP TABLE impact_assessments;
ALTER TABLE impact_assessments_v2 RENAME TO impact_assessments;
CREATE INDEX idx_impact_assessments_account ON impact_assessments(optimize_account_id, conducted_date);

CREATE TABLE account_tech_stack_v2 (
  id                  TEXT PRIMARY KEY,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  tech_area           TEXT NOT NULL,
  tech_area_label     TEXT,
  current_vendor      TEXT,
  current_solution    TEXT,
  time_rating         TEXT,
  notes               TEXT,
  last_reviewed       TEXT,
  reviewed_by_user_id TEXT REFERENCES users(id),
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  functional_fit      INTEGER,
  technical_fit       INTEGER,
  contract_expiration TEXT,
  initiative_start    TEXT
);
INSERT INTO account_tech_stack_v2
SELECT ts.id, cm.account_id, ts.tech_area, ts.tech_area_label, ts.current_vendor, ts.current_solution,
       ts.time_rating, ts.notes, ts.last_reviewed, ts.reviewed_by_user_id, ts.created_at, ts.updated_at,
       ts.functional_fit, ts.technical_fit, ts.contract_expiration, ts.initiative_start
FROM account_tech_stack ts JOIN _child_map cm ON cm.project_id = ts.project_id;

CREATE TABLE roadmap_items_v2 (
  id                  TEXT PRIMARY KEY,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  -- Points at the _v2 table so dropping the old account_tech_stack leaves no
  -- dangling child rows; the RENAME below rewrites this to account_tech_stack.
  tech_stack_id       TEXT REFERENCES account_tech_stack_v2(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'enhancement',
  priority            TEXT NOT NULL DEFAULT 'medium',
  time_rating         TEXT,
  status              TEXT NOT NULL DEFAULT 'identified',
  target_date         TEXT,
  linked_solution_id  TEXT,
  linked_project_id   TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO roadmap_items_v2
SELECT ri.id, cm.account_id, ri.tech_stack_id, ri.title, ri.description, ri.category, ri.priority,
       ri.time_rating, ri.status, ri.target_date, ri.linked_solution_id, ri.linked_project_id,
       ri.created_by, ri.created_at, ri.updated_at
FROM roadmap_items ri JOIN _child_map cm ON cm.project_id = ri.project_id;

DROP TABLE roadmap_items;
DROP TABLE account_tech_stack;
ALTER TABLE account_tech_stack_v2 RENAME TO account_tech_stack;
ALTER TABLE roadmap_items_v2 RENAME TO roadmap_items;
CREATE INDEX idx_account_tech_stack_account ON account_tech_stack(optimize_account_id);
CREATE INDEX idx_roadmap_items_account ON roadmap_items(optimize_account_id);

CREATE TABLE utilization_snapshots_v2 (
  id                  TEXT PRIMARY KEY,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  snapshot_date       TEXT NOT NULL,
  licenses_purchased  INTEGER,
  licenses_assigned   INTEGER,
  active_users_30d    INTEGER,
  active_users_90d    INTEGER,
  total_meetings      INTEGER,
  total_call_minutes  INTEGER,
  raw_data            TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO utilization_snapshots_v2
SELECT us.id, cm.account_id, us.platform, us.snapshot_date, us.licenses_purchased, us.licenses_assigned,
       us.active_users_30d, us.active_users_90d, us.total_meetings, us.total_call_minutes,
       us.raw_data, us.created_at
FROM utilization_snapshots us JOIN _child_map cm ON cm.project_id = us.project_id;
DROP TABLE utilization_snapshots;
ALTER TABLE utilization_snapshots_v2 RENAME TO utilization_snapshots;
CREATE INDEX idx_utilization_snapshots_account ON utilization_snapshots(optimize_account_id, snapshot_date);

-- ── 4. Graduated implementation projects → history links ────────────────────

CREATE TABLE optimize_account_projects (
  project_id          TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  optimize_account_id TEXT NOT NULL REFERENCES optimize_accounts(id) ON DELETE CASCADE,
  linked_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  linked_by           TEXT REFERENCES users(id)
);
CREATE INDEX idx_optimize_account_projects_account ON optimize_account_projects(optimize_account_id);

-- A shell is a project that existed only to carry an Optimize account: no
-- plan, no work, no files, nothing referencing it. Anything else is a real
-- implementation and is kept and linked. Contacts don't make a project real:
-- a shell's contacts are moved onto the customer's contact list below.
CREATE TABLE _shells AS
SELECT m.project_id AS id FROM _oa_map m
WHERE NOT EXISTS (SELECT 1 FROM stages                       WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM tasks                        WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM phases                       WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM notes                        WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM documents                    WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM risks                        WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM project_time_entries         WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM stage_time_entries           WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM task_time_entries            WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM task_comments                WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM project_internal_notes       WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM project_meetings             WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM project_shipments            WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM project_external_resources   WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM custom_plan_items            WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM zoom_recordings              WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM meeting_prep_sends           WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM sharepoint_uploads           WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM sharepoint_file_events       WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM sharepoint_edit_grants       WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM sharepoint_folder_visibility WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM phase_contacts               WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM phase_staff                  WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM assessments                  WHERE project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM solutions                    WHERE linked_project_id = m.project_id)
  AND NOT EXISTS (SELECT 1 FROM roadmap_items                WHERE linked_project_id = m.project_id);

INSERT INTO optimize_account_projects (project_id, optimize_account_id, linked_at, linked_by)
SELECT m.project_id, m.new_id, m.graduated_at, m.graduated_by
FROM _oa_map m
WHERE m.new_id IS NOT NULL AND m.project_id NOT IN (SELECT id FROM _shells);

INSERT INTO customer_contacts (id, customer_id, dynamics_contact_id, name, email, phone, job_title, contact_role, added_at)
SELECT pc.id, p.customer_id, pc.dynamics_contact_id, pc.name, pc.email, pc.phone, pc.job_title, pc.contact_role, pc.added_at
FROM project_contacts pc
JOIN projects p ON p.id = pc.project_id
WHERE pc.project_id IN (SELECT id FROM _shells)
  AND p.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_contacts cc
    WHERE cc.customer_id = p.customer_id
      AND ((pc.dynamics_contact_id IS NOT NULL AND cc.dynamics_contact_id = pc.dynamics_contact_id)
        OR (pc.email IS NOT NULL AND LOWER(cc.email) = LOWER(pc.email)))
  );

DELETE FROM project_contacts WHERE project_id IN (SELECT id FROM _shells);
DELETE FROM project_staff  WHERE project_id IN (SELECT id FROM _shells);
DELETE FROM project_access WHERE project_id IN (SELECT id FROM _shells);
DELETE FROM notifications  WHERE project_id IN (SELECT id FROM _shells);
DELETE FROM projects       WHERE id         IN (SELECT id FROM _shells);

DROP TABLE _shells;
DROP TABLE _child_map;
DROP TABLE _oa_map;
