-- Managers authenticate through the existing activated account/invitation lifecycle.
-- Additive mapping avoids rebuilding khotwa_accounts and breaking invitation FKs.
CREATE TABLE IF NOT EXISTS khotwa_manager_accounts (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES khotwa_accounts(id)
);
