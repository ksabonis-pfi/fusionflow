-- Revert of 0154_client_success_phase1.sql. The Client Success module was
-- shipped to staging and promoted to production without approval — pulling
-- the schema back out cleanly rather than leaving orphaned columns/tables.
-- No real data existed in any of these (the feature was live only hours,
-- with no data-entry UI ever built), so a straight drop is safe here.

DROP TABLE IF EXISTS customer_renewals;
DROP TABLE IF EXISTS customer_platforms;
DROP TABLE IF EXISTS customer_engagements;

ALTER TABLE customer_contacts DROP COLUMN csm_role;
ALTER TABLE customer_contacts DROP COLUMN engagement_level;
ALTER TABLE customer_contacts DROP COLUMN still_active;

ALTER TABLE customers DROP COLUMN csm_tier;
ALTER TABLE customers DROP COLUMN csm_industry;
ALTER TABLE customers DROP COLUMN csm_locations_count;
ALTER TABLE customers DROP COLUMN client_success_specialist_user_id;
ALTER TABLE customers DROP COLUMN executive_sponsor_contact_id;
ALTER TABLE customers DROP COLUMN primary_admin_contact_id;
ALTER TABLE customers DROP COLUMN relationship_strength;
ALTER TABLE customers DROP COLUMN last_qbr_date;
ALTER TABLE customers DROP COLUMN next_qbr_date;
ALTER TABLE customers DROP COLUMN customer_since_date;
ALTER TABLE customers DROP COLUMN csm_notes;
