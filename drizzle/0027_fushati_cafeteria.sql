-- Fushati is an additive global module. Student and parent identity remains in
-- Khotwa's existing per-school tables and shared parent identities.
CREATE TABLE IF NOT EXISTS fushati_cafeterias (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES khotwa_schools(id) ON DELETE RESTRICT,
 name TEXT NOT NULL,
 bank_name TEXT NOT NULL DEFAULT '',
 iban TEXT NOT NULL DEFAULT '',
 beneficiary TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL,
 UNIQUE(school_id,name)
);
CREATE INDEX IF NOT EXISTS fushati_cafeterias_school_idx ON fushati_cafeterias(school_id);
CREATE TABLE IF NOT EXISTS fushati_users (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL UNIQUE,
 full_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('fushati_admin','fushati_agent')),
 password_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 must_change_password INTEGER NOT NULL DEFAULT 1,
 session_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fushati_assignments (
 user_id TEXT NOT NULL REFERENCES fushati_users(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 PRIMARY KEY(user_id,cafeteria_id)
);
CREATE INDEX IF NOT EXISTS fushati_assignments_cafeteria_idx ON fushati_assignments(cafeteria_id);
CREATE TABLE IF NOT EXISTS fushati_menu_items (
 id TEXT PRIMARY KEY NOT NULL,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 name TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'عام',
 price_minor INTEGER NOT NULL CHECK(price_minor>=0 AND price_minor<=1000000),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fushati_menu_cafe_idx ON fushati_menu_items(cafeteria_id);
CREATE TABLE IF NOT EXISTS fushati_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES khotwa_schools(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 student_id TEXT NOT NULL,
 balance_minor INTEGER NOT NULL DEFAULT 0 CHECK(balance_minor>=0),
 daily_limit_minor INTEGER NOT NULL DEFAULT 300 CHECK(daily_limit_minor>=0),
 monthly_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK(monthly_limit_minor>=0),
 allowed_item_ids TEXT NOT NULL DEFAULT '[]',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 spent_day_minor INTEGER NOT NULL DEFAULT 0 CHECK(spent_day_minor>=0),
 spent_month_minor INTEGER NOT NULL DEFAULT 0 CHECK(spent_month_minor>=0),
 day_key TEXT NOT NULL DEFAULT '',
 month_key TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(cafeteria_id,student_id)
);
CREATE INDEX IF NOT EXISTS fushati_accounts_school_student_idx ON fushati_accounts(school_id,student_id);
CREATE TABLE IF NOT EXISTS fushati_transfers (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES fushati_accounts(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 parent_phone TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),
 bank_reference TEXT NOT NULL,
 destination_iban TEXT NOT NULL,
 receipt_key TEXT NOT NULL,
 receipt_mime TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_note TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT NOT NULL DEFAULT '',
 reviewed_at TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(cafeteria_id,bank_reference),
 UNIQUE(destination_iban,bank_reference)
);
CREATE INDEX IF NOT EXISTS fushati_transfers_pending_idx ON fushati_transfers(cafeteria_id,status);
CREATE TABLE IF NOT EXISTS fushati_purchases (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES fushati_accounts(id) ON DELETE RESTRICT,
 cafeteria_id TEXT NOT NULL REFERENCES fushati_cafeterias(id) ON DELETE RESTRICT,
 agent_id TEXT NOT NULL,
 items_json TEXT NOT NULL,
 total_minor INTEGER NOT NULL CHECK(total_minor>0),
 day_key TEXT NOT NULL,
 month_key TEXT NOT NULL,
 posted INTEGER NOT NULL DEFAULT 0 CHECK(posted IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fushati_purchases_account_idx ON fushati_purchases(account_id,created_at);
CREATE TABLE IF NOT EXISTS fushati_ledger (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES fushati_accounts(id) ON DELETE RESTRICT,
 amount_minor INTEGER NOT NULL CHECK(amount_minor<>0),
 entry_type TEXT NOT NULL CHECK(entry_type IN ('transfer','purchase')),
 reference_id TEXT NOT NULL,
 description TEXT NOT NULL,
 day_key TEXT NOT NULL DEFAULT '',
 month_key TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(entry_type,reference_id)
);
CREATE INDEX IF NOT EXISTS fushati_ledger_account_idx ON fushati_ledger(account_id,created_at);
-- This trigger performs balance/limit checking and debit atomically inside
-- SQLite's write transaction: concurrent checkouts cannot overspend.
CREATE TRIGGER IF NOT EXISTS fushati_ledger_before_insert BEFORE INSERT ON fushati_ledger BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM fushati_accounts WHERE id=NEW.account_id AND active=1)
  THEN RAISE(ABORT,'FUSHATI_ACCOUNT_INACTIVE') END;
 SELECT CASE WHEN NEW.entry_type='purchase' AND (NEW.amount_minor>=0 OR
  (SELECT balance_minor FROM fushati_accounts WHERE id=NEW.account_id)<-NEW.amount_minor)
  THEN RAISE(ABORT,'FUSHATI_INSUFFICIENT_BALANCE') END;
 SELECT CASE WHEN NEW.entry_type='purchase' AND (
  SELECT (CASE WHEN day_key=NEW.day_key THEN spent_day_minor ELSE 0 END)-NEW.amount_minor>daily_limit_minor
  FROM fushati_accounts WHERE id=NEW.account_id)
  THEN RAISE(ABORT,'FUSHATI_DAILY_LIMIT') END;
 SELECT CASE WHEN NEW.entry_type='purchase' AND (
  SELECT monthly_limit_minor>0 AND
  (CASE WHEN month_key=NEW.month_key THEN spent_month_minor ELSE 0 END)-NEW.amount_minor>monthly_limit_minor
  FROM fushati_accounts WHERE id=NEW.account_id)
  THEN RAISE(ABORT,'FUSHATI_MONTHLY_LIMIT') END;
 SELECT CASE WHEN NEW.entry_type='purchase' AND EXISTS(
   SELECT 1 FROM fushati_purchases p JOIN fushati_accounts a ON a.id=p.account_id
   WHERE p.id=NEW.reference_id AND json_array_length(a.allowed_item_ids)>0
   AND EXISTS(SELECT 1 FROM json_each(p.items_json) item
    WHERE NOT EXISTS(SELECT 1 FROM json_each(a.allowed_item_ids) permitted WHERE permitted.value=json_extract(item.value,'$.id')))
  ) THEN RAISE(ABORT,'FUSHATI_ITEM_BLOCKED') END;
 SELECT CASE WHEN NEW.entry_type='transfer' AND NEW.amount_minor<=0 THEN RAISE(ABORT,'FUSHATI_INVALID_CREDIT') END;
END;
-- Keep this trigger free of nested CASE/END blocks: Wrangler 4.92's
-- local migration statement splitter otherwise divides this trigger early.
-- IIF() has been supported by SQLite since 3.32 and preserves the logic.
CREATE TRIGGER IF NOT EXISTS fushati_ledger_after_insert AFTER INSERT ON fushati_ledger BEGIN
 UPDATE fushati_accounts SET
  balance_minor=balance_minor+NEW.amount_minor,
  spent_day_minor=IIF(NEW.entry_type='purchase', IIF(day_key=NEW.day_key,spent_day_minor,0)-NEW.amount_minor, spent_day_minor),
  spent_month_minor=IIF(NEW.entry_type='purchase', IIF(month_key=NEW.month_key,spent_month_minor,0)-NEW.amount_minor, spent_month_minor),
  day_key=IIF(NEW.entry_type='purchase',NEW.day_key,day_key),
  month_key=IIF(NEW.entry_type='purchase',NEW.month_key,month_key)
 WHERE id=NEW.account_id;
END;
CREATE TABLE IF NOT EXISTS fushati_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 operation TEXT NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
