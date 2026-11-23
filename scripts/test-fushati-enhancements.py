"""Regression smoke test for Fushati schema 0028 and stock debit.

Run: python3 scripts/test-fushati-enhancements.py
SQLite-only test; does not replace running the Worker in Coolify.
"""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
conn = sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=ON')
conn.execute('CREATE TABLE khotwa_schools (id TEXT PRIMARY KEY, name TEXT, active INTEGER)')
conn.executescript((root / 'drizzle/0027_fushati_cafeteria.sql').read_text())
conn.execute("INSERT INTO khotwa_schools VALUES('000000000001','School',1)")
conn.execute("INSERT INTO fushati_cafeterias(id,school_id,name,created_at) VALUES('c','000000000001','Cafeteria','2026-11-23')")
conn.execute("INSERT INTO fushati_users(id,email,full_name,role,password_hash,created_at) VALUES('u','agent@old.test','Agent','fushati_agent','hash','2026-11-23')")
conn.execute("INSERT INTO fushati_menu_items(id,cafeteria_id,name,price_minor,created_by,created_at) VALUES('m','c','Lunch',100,'u','2026-11-23')")
conn.execute("INSERT INTO fushati_accounts(id,school_id,cafeteria_id,student_id,created_at) VALUES('a','000000000001','c','s','2026-11-23')")
conn.executescript((root / 'drizzle/0028_khotwa_fushati_enhancements.sql').read_text())
assert conn.execute("SELECT stage FROM khotwa_schools WHERE id='000000000001'").fetchone()[0] == 'general'
nonce = conn.execute("SELECT card_nonce FROM fushati_accounts WHERE id='a'").fetchone()[0]
assert len(nonce) == 32
assert conn.execute("SELECT tracked,on_hand FROM fushati_inventory WHERE menu_item_id='m'").fetchone() == (0, 0)
conn.execute("UPDATE fushati_inventory SET tracked=1,on_hand=2 WHERE menu_item_id='m'")

def credit():
    conn.execute("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,created_at) VALUES('credit','a',1000,'transfer','transfer','credit','2026-11-23')")

def purchase(ref, count):
    price = count * 100
    conn.execute("INSERT INTO fushati_purchases(id,account_id,cafeteria_id,agent_id,items_json,total_minor,day_key,month_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (ref,'a','c','u',json.dumps([{'id':'m','quantity':count}]),price,'2026-11-23','2026-11','2026-11-23'))
    conn.execute("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,day_key,month_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (ref+'-ledger','a',-price,'purchase',ref,'sale','2026-11-23','2026-11','2026-11-23'))

credit()
purchase('first',1)
assert conn.execute("SELECT on_hand FROM fushati_inventory WHERE menu_item_id='m'").fetchone()[0] == 1
try:
    purchase('excess',2)
except sqlite3.IntegrityError as exc:
    assert 'FUSHATI_OUT_OF_STOCK' in str(exc), str(exc)
else:
    raise AssertionError('Overselling must be rejected')
assert conn.execute("SELECT balance_minor FROM fushati_accounts WHERE id='a'").fetchone()[0] == 900
purchase('last',1)
assert conn.execute("SELECT balance_minor FROM fushati_accounts WHERE id='a'").fetchone()[0] == 800
assert conn.execute("SELECT on_hand FROM fushati_inventory WHERE menu_item_id='m'").fetchone()[0] == 0
assert conn.execute("SELECT COUNT(*) FROM fushati_stock_movements WHERE menu_item_id='m' AND reason='purchase'").fetchone()[0] == 2
print('PASS 0028: school stage default, existing card migration, tracked stock, blocked overselling, balance integrity and stock movement audit')
