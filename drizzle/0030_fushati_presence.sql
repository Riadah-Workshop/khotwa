-- Cafeteria location, staff phone and arrival/departure records (Fushati phase 3). Additive only.
--
-- A cafeteria has one map point (normally the school's gate or the cafeteria door) and an arrival radius.
-- Both are blank until the system administrator sets them; until then agents cannot check in and the map
-- shows the cafeteria as "location not set".
ALTER TABLE fushati_cafeterias ADD COLUMN latitude REAL;
ALTER TABLE fushati_cafeterias ADD COLUMN longitude REAL;
ALTER TABLE fushati_cafeterias ADD COLUMN arrival_radius_m INTEGER NOT NULL DEFAULT 150;

-- A contact number shown to the cafeteria administrator next to the agent on the map. Blank means "use the
-- login phone number, if the agent signs in with one".
ALTER TABLE fushati_users ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- One row per stay of an agent at a cafeteria. The agent's position is recorded only between arrival and
-- departure: while left_at IS NULL the last_* columns hold the latest position the agent's phone reported.
-- When a phone stops reporting, the stay is treated as ended at last_seen_at (see lib/fushati/presence-rules.ts);
-- nothing here needs a scheduled job.
CREATE TABLE IF NOT EXISTS fushati_visits (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES fushati_users(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 day_key TEXT NOT NULL,
 arrived_at TEXT NOT NULL,
 arrive_lat REAL NOT NULL,
 arrive_lng REAL NOT NULL,
 arrive_accuracy_m INTEGER NOT NULL,
 arrive_distance_m INTEGER NOT NULL,
 last_lat REAL NOT NULL,
 last_lng REAL NOT NULL,
 last_accuracy_m INTEGER NOT NULL,
 last_seen_at TEXT NOT NULL,
 left_at TEXT,
 leave_reason TEXT CHECK(leave_reason IS NULL OR leave_reason IN ('manual','left_area','moved','signal_lost','closed_by_admin'))
);
-- An agent can be at only one cafeteria at a time, and the database enforces it.
CREATE UNIQUE INDEX IF NOT EXISTS fushati_visits_one_open_per_user ON fushati_visits(user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS fushati_visits_cafeteria_idx ON fushati_visits(cafeteria_id,arrived_at);
CREATE INDEX IF NOT EXISTS fushati_visits_user_idx ON fushati_visits(user_id,arrived_at);
