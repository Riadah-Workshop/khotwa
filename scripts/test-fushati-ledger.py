"""Standard-library smoke test for 0027 Fushati accounting invariants.
Run: python3 scripts/test-fushati-ledger.py
This tests the SQLite triggers; it does not substitute for browser/Worker E2E.
"""
import sqlite3
from pathlib import Path

sql = (Path(__file__).resolve().parents[1] / 'drizzle/0027_fushati_cafeteria.sql').read_text()
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.execute('CREATE TABLE khotwa_schools(id TEXT PRIMARY KEY, name TEXT, active INTEGER)')
db.executescript(sql)
db.execute("INSERT INTO khotwa_schools VALUES('000000000001','Testing',1)")
db.execute("INSERT INTO fushati_cafeterias(id,school_id,name,created_at) VALUES('c','000000000001','Canteen','2026-11-23')")
db.execute("INSERT INTO fushati_accounts(id,school_id,cafeteria_id,student_id,created_at) VALUES('a','000000000001','c','s','2026-11-23')")

def balance():
    return db.execute("SELECT balance_minor,spent_day_minor,spent_month_minor FROM fushati_accounts WHERE id='a'").fetchone()

def ledger(lid, kind, amount, ref, day='2026-11-23',month='2026-11'):
    db.execute('INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,day_key,month_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)', (lid,'a',amount,kind,ref,kind,day,month,day))

def reject(action, reason):
    try:
        action()
    except sqlite3.IntegrityError as e:
        assert reason in str(e), (reason, str(e))
    else:
        raise AssertionError('Expected rejection: '+reason)

reject(lambda: ledger('p0','purchase',-1,'p0'),'FUSHATI_INSUFFICIENT_BALANCE')
ledger('t1','transfer',5000,'t1')
assert balance() == (5000,0,0), balance()
ledger('p1','purchase',-200,'p1')
assert balance()==(4800,200,200), balance()
reject(lambda: ledger('p2','purchase',-150,'p2'),'FUSHATI_DAILY_LIMIT')
reject(lambda: ledger('p1-retry','purchase',-1,'p1','2026-12-01','2026-12'),'UNIQUE')
ledger('p3','purchase',-300,'p3','2026-11-24','2026-11')
assert balance()==(4500,300,500), balance()
db.execute("UPDATE fushati_accounts SET daily_limit_minor=400, monthly_limit_minor=600 WHERE id='a'")
reject(lambda: ledger('p4','purchase',-200,'p4','2026-11-25','2026-11'),'FUSHATI_MONTHLY_LIMIT')
ledger('p5','purchase',-100,'p5','2026-12-01','2026-12')
assert balance()==(4400,100,100), balance()
db.execute("UPDATE fushati_accounts SET active=0 WHERE id='a'")
reject(lambda: ledger('p6','purchase',-1,'p6','2026-12-02','2026-12'),'FUSHATI_ACCOUNT_INACTIVE')
print('PASS Fushati: money in minor units, insufficient funds, daily/monthly budget, duplicate posting, day/month rollover, inactive account')
