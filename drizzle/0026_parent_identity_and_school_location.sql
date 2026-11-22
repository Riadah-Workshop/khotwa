-- Additive school geography. Existing schools retain blank location until set by admin.
ALTER TABLE khotwa_schools ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE khotwa_schools ADD COLUMN city TEXT NOT NULL DEFAULT '';

-- One global parent phone/password; school membership remains in each school's
-- parent_grants, and each student's records remain in that school's tenant tables.
-- Preserve legacy khotwa_parent_users in place for rollback and audit purposes.
CREATE TABLE IF NOT EXISTS khotwa_parent_identities (
 phone TEXT PRIMARY KEY NOT NULL,
 password_hash TEXT NOT NULL,
 session_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
-- For phones with several old school accounts, retain the earliest active
-- account's password as the canonical login. No old credentials are deleted.
INSERT OR IGNORE INTO khotwa_parent_identities(phone,password_hash,session_version,created_at)
SELECT phone,password_hash,1,created_at FROM (
 SELECT phone,password_hash,created_at,
 ROW_NUMBER() OVER(PARTITION BY phone ORDER BY active DESC,created_at ASC,id ASC) AS rn
 FROM khotwa_parent_users
) WHERE rn=1;
CREATE TABLE IF NOT EXISTS khotwa_account_email_changes (
 token_hash TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES khotwa_accounts(id),
 new_email TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS khotwa_account_email_changes_account_idx ON khotwa_account_email_changes(account_id);

-- Indexed school membership avoids scanning every school on each parent request.
-- Legacy active school accounts are kept as membership records. Live grants
-- remain authoritative and are checked again before showing student data.
CREATE TABLE IF NOT EXISTS khotwa_parent_memberships (
 phone TEXT NOT NULL,
 school_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY (phone,school_id)
);
CREATE INDEX IF NOT EXISTS khotwa_parent_memberships_school_idx ON khotwa_parent_memberships(school_id);
INSERT OR IGNORE INTO khotwa_parent_memberships(phone,school_id,enabled,updated_at)
SELECT p.phone,p.school_id,1,p.created_at
FROM khotwa_parent_users p JOIN khotwa_schools s ON s.id=p.school_id
WHERE p.active=1 AND s.active=1;
