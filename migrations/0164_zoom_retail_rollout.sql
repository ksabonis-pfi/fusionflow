-- Zoom Retail Rollout: hidden demo module for franchise Zoom Phone ordering
-- (template + phone model → auto SOW → e-sign → ScanSource → kit/QR → ship →
-- QR self-setup → verified). Gated by an explicit per-user flag, NOT implied
-- by admin, so only the people granted below can see it.
ALTER TABLE users ADD COLUMN is_rollout INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_rollout = 1 WHERE lower(email) IN ('rdyla@packetfusion.com', 'ksabonis@packetfusion.com');

CREATE TABLE rollout_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  sow_number TEXT NOT NULL,
  access_token TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'submitted',
  wave TEXT NOT NULL,
  region TEXT NOT NULL,
  store_number TEXT NOT NULL,
  store_name TEXT NOT NULL,
  address1 TEXT NOT NULL,
  address2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  timezone TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_title TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  template_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  phone_qty INTEGER NOT NULL,
  has_poe INTEGER NOT NULL DEFAULT 1,
  number_option TEXT NOT NULL DEFAULT 'new',
  port_number TEXT,
  port_carrier TEXT,
  notes TEXT,
  one_time_total REAL NOT NULL,
  monthly_total REAL NOT NULL,
  signed_name TEXT,
  signed_title TEXT,
  signed_at TEXT,
  scansource_order TEXT,
  zoom_site_id TEXT,
  main_number TEXT,
  carrier TEXT,
  tracking_number TEXT,
  eta TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  live_at TEXT,
  verified_at TEXT,
  autopilot INTEGER NOT NULL DEFAULT 0,
  next_step_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_rollout_orders_stage ON rollout_orders(stage);

CREATE TABLE rollout_phones (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rollout_orders(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  extension TEXT,
  mac TEXT,
  serial TEXT,
  zoom_device_id TEXT,
  setup_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  registered_at TEXT,
  verified_at TEXT
);
CREATE INDEX idx_rollout_phones_order ON rollout_phones(order_id);

CREATE TABLE rollout_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rollout_orders(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  system TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  request_json TEXT,
  response_json TEXT
);
CREATE INDEX idx_rollout_events_order ON rollout_events(order_id, ts);

CREATE TABLE rollout_support (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rollout_orders(id) ON DELETE CASCADE,
  phone_id TEXT,
  ts TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
