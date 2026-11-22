-- Operational audit history for privileged deletion attempts.
-- Do not place this audit table in a deletable school's tenant tables.
CREATE TABLE IF NOT EXISTS khotwa_admin_delete_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_email TEXT NOT NULL,
 operation TEXT NOT NULL,
 school_id TEXT NOT NULL,
 record_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK (stage IN ('requested','completed')),
 created_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS khotwa_admin_delete_audit_time_idx ON khotwa_admin_delete_audit(created_at);
