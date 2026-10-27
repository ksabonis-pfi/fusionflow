-- Customer Contacts becomes a true mirror of the account's CE contacts
-- (synced via "Sync from CRM"), rather than a purely manual list.
-- ce_active tracks whether a synced contact is still active in CE;
-- deactivated-in-CE rows are hidden rather than deleted, preserving history.

ALTER TABLE customer_contacts ADD COLUMN ce_active INTEGER DEFAULT 1;
ALTER TABLE customer_contacts ADD COLUMN ce_synced_at TEXT;
