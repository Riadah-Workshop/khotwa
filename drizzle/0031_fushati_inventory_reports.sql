-- Cafeteria phase 2: inventory management and reports.
--
-- Stock movements get a finer "kind" (waste, damage, expired, return, stocktake) and a note, so reports can
-- tell a sale from spoilage from a stock count. The existing "reason" column and its CHECK are left alone
-- (waste, damage, expired, return and stocktake are stored as reason 'correction'), because changing a CHECK
-- in SQLite means rebuilding the table and the purchase trigger that writes to it.
--
-- A cost price per item is optional (0 means "not known") and feeds the estimated-margin report only.
ALTER TABLE fushati_inventory ADD COLUMN cost_minor INTEGER NOT NULL DEFAULT 0 CHECK(cost_minor>=0 AND cost_minor<=1000000);
ALTER TABLE fushati_stock_movements ADD COLUMN kind TEXT NOT NULL DEFAULT '' CHECK(kind IN ('','waste','damage','expired','return','stocktake'));
ALTER TABLE fushati_stock_movements ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=200);
ALTER TABLE fushati_stock_movements ADD COLUMN unit_cost_minor INTEGER CHECK(unit_cost_minor IS NULL OR (unit_cost_minor>=0 AND unit_cost_minor<=1000000));

-- Reports read by cafeteria and date.
CREATE INDEX IF NOT EXISTS fushati_stock_item_idx ON fushati_stock_movements(menu_item_id,created_at);
CREATE INDEX IF NOT EXISTS fushati_purchases_cafe_day_idx ON fushati_purchases(cafeteria_id,day_key);
CREATE INDEX IF NOT EXISTS fushati_transfers_cafe_created_idx ON fushati_transfers(cafeteria_id,created_at);

-- Agent positions are kept for 30 days, then blanked (the times of the stay stay). The coordinate columns
-- were NOT NULL, so the table is rebuilt with them nullable. Nothing else refers to fushati_visits.
CREATE TABLE fushati_visits_v2 (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES fushati_users(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 day_key TEXT NOT NULL,
 arrived_at TEXT NOT NULL,
 arrive_lat REAL,
 arrive_lng REAL,
 arrive_accuracy_m INTEGER NOT NULL,
 arrive_distance_m INTEGER NOT NULL,
 last_lat REAL,
 last_lng REAL,
 last_accuracy_m INTEGER NOT NULL,
 last_seen_at TEXT NOT NULL,
 left_at TEXT,
 leave_reason TEXT CHECK(leave_reason IS NULL OR leave_reason IN ('manual','left_area','moved','signal_lost','closed_by_admin'))
);
INSERT INTO fushati_visits_v2(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,left_at,leave_reason)
 SELECT id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,left_at,leave_reason FROM fushati_visits;
DROP TABLE fushati_visits;
ALTER TABLE fushati_visits_v2 RENAME TO fushati_visits;
CREATE UNIQUE INDEX IF NOT EXISTS fushati_visits_one_open_per_user ON fushati_visits(user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS fushati_visits_cafeteria_idx ON fushati_visits(cafeteria_id,arrived_at);
CREATE INDEX IF NOT EXISTS fushati_visits_user_idx ON fushati_visits(user_id,arrived_at);
-- Finds the finished stays that still hold coordinates, so the 30-day clean-up does not read the whole table.
CREATE INDEX IF NOT EXISTS fushati_visits_unpurged_idx ON fushati_visits(left_at) WHERE arrive_lat IS NOT NULL OR last_lat IS NOT NULL;
