-- Sign-in time stamps for every role, and e-mail alerts for cafeteria arrivals. Additive only.
--
-- A stamp is written each time someone signs in successfully (school staff, managers, the system administrator,
-- cafeteria administrators and agents, parents). It holds the time, who, which school, and whether it came from the
-- website or the Android / iOS app. It holds NO position, no IP address and no device identifier.
CREATE TABLE IF NOT EXISTS khotwa_login_stamps (
 id TEXT PRIMARY KEY NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('main_admin','manager','deputy','parent','fushati_admin','fushati_agent')),
 account_key TEXT NOT NULL,
 school_id TEXT NOT NULL DEFAULT '',
 signed_in_at TEXT NOT NULL,
 day_key TEXT NOT NULL,
 channel TEXT NOT NULL DEFAULT 'web' CHECK(channel IN ('web','android','ios')),
 app_version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS khotwa_login_stamps_time_idx ON khotwa_login_stamps(signed_in_at);
CREATE INDEX IF NOT EXISTS khotwa_login_stamps_account_idx ON khotwa_login_stamps(account_key,signed_in_at);

-- A cafeteria administrator may ask to be e-mailed when an agent arrives at or leaves one of his cafeterias. Off by default.
ALTER TABLE fushati_users ADD COLUMN presence_email INTEGER NOT NULL DEFAULT 0 CHECK(presence_email IN (0,1));

-- When the server heard of an arrival or a departure. A phone that was offline reports late with the time it saw the
-- event (arrived_at / left_at), so the administrator's alert feed follows these two columns, not the event times.
-- Rows from before this migration have none: the alert feed falls back to the event time for them.
ALTER TABLE fushati_visits ADD COLUMN arrival_logged_at TEXT;
ALTER TABLE fushati_visits ADD COLUMN departure_logged_at TEXT;
