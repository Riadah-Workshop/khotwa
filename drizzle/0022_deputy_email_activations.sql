-- Deputy email invitation lifecycle; preserve all existing deputy credentials.
ALTER TABLE khotwa_accounts ADD COLUMN activated_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN password_set_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN first_login_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN invited_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN invitation_status TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE khotwa_accounts ADD COLUMN email_accepted_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN email_delivered_at TEXT;
ALTER TABLE khotwa_accounts ADD COLUMN email_provider_id TEXT;
UPDATE khotwa_accounts SET activated_at=created_at,password_set_at=created_at WHERE password_hash LIKE 'pbkdf2-sha256$%';
CREATE TABLE IF NOT EXISTS khotwa_deputy_invites (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES khotwa_accounts(id),
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS khotwa_invite_account_idx ON khotwa_deputy_invites(account_id,created_at);
-- Also store events received before the send API returns its email ID.
CREATE TABLE IF NOT EXISTS khotwa_deputy_email_events (
 email_id TEXT PRIMARY KEY NOT NULL,
 status TEXT NOT NULL,
 seen_at TEXT NOT NULL
);
-- Retire the old hard-coded sample deputy name without modifying historical student records.
UPDATE settings SET value='' WHERE id='deputy' AND value='عايض عوض سعيد القحطاني';
