-- 0028: Khotwa school stage, administrator credential rotation, Fushati cards, stock, invitations and absence alerts.
-- Additive only: no existing records or finance history are removed.
ALTER TABLE khotwa_schools ADD COLUMN stage TEXT NOT NULL DEFAULT 'general' CHECK(stage IN ('general','kindergarten','elementary','intermediate','secondary'));
CREATE TABLE IF NOT EXISTS khotwa_admin_credentials (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1),
 email TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 session_version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
ALTER TABLE fushati_users ADD COLUMN login_identifier TEXT NOT NULL DEFAULT '';
ALTER TABLE fushati_users ADD COLUMN activated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fushati_login_identifier_unique ON fushati_users(login_identifier) WHERE login_identifier<>'';
-- Pre-existing accounts retain access (email login); only newly invited managers require activation.
UPDATE fushati_users SET activated_at=created_at WHERE role='fushati_admin' AND activated_at IS NULL;
CREATE TABLE IF NOT EXISTS fushati_invites (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES fushati_users(id) ON DELETE RESTRICT,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fushati_invites_user_idx ON fushati_invites(user_id,expires_at);
ALTER TABLE fushati_accounts ADD COLUMN card_nonce TEXT NOT NULL DEFAULT '';
UPDATE fushati_accounts SET card_nonce=lower(hex(randomblob(16))) WHERE card_nonce='';
CREATE TABLE IF NOT EXISTS fushati_attendance_alerts (
 id TEXT PRIMARY KEY NOT NULL,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 school_id TEXT NOT NULL,
 student_id TEXT NOT NULL,
 parent_phone TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 day_key TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT 'absent_checkout_denied',
 created_at TEXT NOT NULL,
 UNIQUE(cafeteria_id,student_id,day_key)
);
CREATE INDEX IF NOT EXISTS fushati_alerts_parent_idx ON fushati_attendance_alerts(parent_phone,created_at);
CREATE TABLE IF NOT EXISTS fushati_inventory (
 menu_item_id TEXT PRIMARY KEY NOT NULL REFERENCES fushati_menu_items(id) ON DELETE RESTRICT,
 tracked INTEGER NOT NULL DEFAULT 0 CHECK(tracked IN (0,1)),
 on_hand INTEGER NOT NULL DEFAULT 0 CHECK(on_hand>=0),
 low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fushati_stock_movements (
 id TEXT PRIMARY KEY NOT NULL,
 menu_item_id TEXT NOT NULL REFERENCES fushati_menu_items(id) ON DELETE RESTRICT,
 delta INTEGER NOT NULL CHECK(delta<>0),
 reason TEXT NOT NULL CHECK(reason IN ('opening','receipt','correction','purchase')),
 reference_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(menu_item_id,reason,reference_id)
);
INSERT OR IGNORE INTO fushati_inventory(menu_item_id,tracked,on_hand,low_stock_threshold,updated_at)
 SELECT id,0,0,5,created_at FROM fushati_menu_items;
CREATE TRIGGER IF NOT EXISTS fushati_inventory_new_menu AFTER INSERT ON fushati_menu_items BEGIN
 INSERT OR IGNORE INTO fushati_inventory(menu_item_id,tracked,on_hand,low_stock_threshold,updated_at)
 VALUES(NEW.id,0,0,5,NEW.created_at);
END;
-- Check stock inside the same ledger write that checks balance to prevent double sales.
CREATE TRIGGER IF NOT EXISTS fushati_inventory_before_purchase BEFORE INSERT ON fushati_ledger WHEN NEW.entry_type='purchase' BEGIN
 SELECT RAISE(ABORT,'FUSHATI_OUT_OF_STOCK') WHERE EXISTS(
  SELECT 1 FROM fushati_purchases p JOIN json_each(p.items_json) item
   JOIN fushati_inventory stock ON stock.menu_item_id=json_extract(item.value,'$.id')
  WHERE p.id=NEW.reference_id AND stock.tracked=1
   AND stock.on_hand<CAST(json_extract(item.value,'$.quantity') AS INTEGER)
 );
END;
CREATE TRIGGER IF NOT EXISTS fushati_inventory_after_purchase AFTER INSERT ON fushati_ledger WHEN NEW.entry_type='purchase' BEGIN
 UPDATE fushati_inventory SET
  on_hand=on_hand-COALESCE((
   SELECT CAST(json_extract(item.value,'$.quantity') AS INTEGER)
   FROM fushati_purchases p JOIN json_each(p.items_json) item
   WHERE p.id=NEW.reference_id AND json_extract(item.value,'$.id')=fushati_inventory.menu_item_id
  ),0),updated_at=NEW.created_at
 WHERE tracked=1 AND menu_item_id IN (
  SELECT json_extract(item.value,'$.id') FROM fushati_purchases p JOIN json_each(p.items_json) item WHERE p.id=NEW.reference_id
 );
 INSERT OR IGNORE INTO fushati_stock_movements(id,menu_item_id,delta,reason,reference_id,actor_id,created_at)
 SELECT lower(hex(randomblob(16))),json_extract(item.value,'$.id'),-CAST(json_extract(item.value,'$.quantity') AS INTEGER),
 'purchase',p.id,p.agent_id,NEW.created_at
 FROM fushati_purchases p JOIN json_each(p.items_json) item JOIN fushati_inventory stock
  ON stock.menu_item_id=json_extract(item.value,'$.id')
 WHERE p.id=NEW.reference_id AND stock.tracked=1;
END;
