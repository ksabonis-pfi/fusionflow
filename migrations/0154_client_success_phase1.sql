-- Client Success module, Phase 1 ("Renewal core") — see CSM App Spec.
-- "Account" in the spec maps onto the existing customers table rather than a
-- new parallel entity, so Dynamics CE stays the single source of truth for
-- customer identity. Total ARR and last-touch fields are deliberately NOT
-- stored here (the spec marks them "(calc)") — they're computed at query
-- time from customer_platforms / customer_engagements so they can't go stale.

ALTER TABLE customers ADD COLUMN csm_tier TEXT;
ALTER TABLE customers ADD COLUMN csm_industry TEXT;
ALTER TABLE customers ADD COLUMN csm_locations_count INTEGER;
ALTER TABLE customers ADD COLUMN client_success_specialist_user_id TEXT REFERENCES users(id);
ALTER TABLE customers ADD COLUMN executive_sponsor_contact_id TEXT REFERENCES customer_contacts(id);
ALTER TABLE customers ADD COLUMN primary_admin_contact_id TEXT REFERENCES customer_contacts(id);
ALTER TABLE customers ADD COLUMN relationship_strength INTEGER;
ALTER TABLE customers ADD COLUMN last_qbr_date TEXT;
ALTER TABLE customers ADD COLUMN next_qbr_date TEXT;
ALTER TABLE customers ADD COLUMN customer_since_date TEXT;
ALTER TABLE customers ADD COLUMN csm_notes TEXT;

ALTER TABLE customer_contacts ADD COLUMN csm_role TEXT;
ALTER TABLE customer_contacts ADD COLUMN engagement_level TEXT;
ALTER TABLE customer_contacts ADD COLUMN still_active INTEGER DEFAULT 1;

-- One row per vendor subscription. active_users_30d is manual entry in
-- Phase 1; Phase 3 automates it via vendor admin APIs.
CREATE TABLE customer_platforms (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  product TEXT NOT NULL,
  licenses_purchased INTEGER,
  licenses_assigned INTEGER,
  active_users_30d INTEGER,
  mrr REAL,
  arr REAL,
  contract_start_date TEXT,
  contract_end_date TEXT,
  term_length_months INTEGER,
  auto_renew INTEGER DEFAULT 0,
  go_live_date TEXT,
  implementation_project_id TEXT REFERENCES projects(id),
  integrations_in_place TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_platforms_customer_id ON customer_platforms(customer_id);

-- One active renewal per platform at a time; past cycles stay as history
-- rows once a new one is opened. renewal_date / days_to_renewal /
-- renewal_window / change_type are calc fields, derived from the parent
-- platform's contract_end_date and this row's ARR fields — not stored.
CREATE TABLE customer_renewals (
  id TEXT PRIMARY KEY,
  customer_platform_id TEXT NOT NULL REFERENCES customer_platforms(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'not_started',
  forecast TEXT,
  current_arr REAL,
  expected_renewal_arr REAL,
  decision_maker_contact_id TEXT REFERENCES customer_contacts(id),
  procurement_contact_id TEXT REFERENCES customer_contacts(id),
  competitive_threat TEXT,
  loss_reason TEXT,
  linked_opportunity_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_renewals_platform_id ON customer_renewals(customer_platform_id);

-- The touchpoint log. attendees is a JSON array of {kind:'contact'|'user', id},
-- same lightweight-JSON-column convention as solution_types/add_ons elsewhere.
-- Follow-ups are surfaced directly in the Action Queue by querying this table
-- rather than creating rows in the project-scoped tasks table.
CREATE TABLE customer_engagements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  engaged_at TEXT NOT NULL,
  type TEXT NOT NULL,
  attendees TEXT,
  summary TEXT,
  sentiment TEXT,
  next_steps TEXT,
  follow_up_owner_user_id TEXT REFERENCES users(id),
  follow_up_due_date TEXT,
  follow_up_done INTEGER DEFAULT 0,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_engagements_customer_id ON customer_engagements(customer_id);
