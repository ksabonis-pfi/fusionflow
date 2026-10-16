-- Additive flag granting access to the Sales Operations module (distributor
-- price & availability, later quotes/orders). Deliberately NOT granted to
-- admins wholesale: it exposes our distributor cost pricing, so only the
-- explicit per-user flag opens it (same pattern as is_time_assist).
ALTER TABLE users ADD COLUMN is_sales_ops INTEGER NOT NULL DEFAULT 0;
