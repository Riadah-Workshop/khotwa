# Cafeteria (Fushati) access model

Who can see and change what in the cafeteria module. The rules are enforced in
`app/api/fushati/route.ts` and `lib/fushati/core.ts` (the permission names are in
`lib/fushati/permissions.ts`) and checked by `scripts/test-cafeteria-access-model.mjs`.

## Roles

| Role | Reaches | Can change |
| --- | --- | --- |
| System administrator | every cafeteria | everything; the only one who creates, renames, re-banks, disables or deletes a cafeteria, creates cafeteria administrators and decides which cafeterias they administer |
| Cafeteria administrator | only the cafeterias assigned to him | the alias of his cafeterias; menu, stock, transfers, reports and staff of his cafeterias |
| Supervisor | the cafeterias assigned to him | only what was granted to him in each cafeteria |
| Cafeteria agent | the cafeterias assigned to him | sell at the counter and propose menu items (until granted more) |

A cafeteria administrator never sees school records (attendance, cases, care).
He sees a student's name, grade and class only where a cafeteria account needs it.

## Permissions

Granted per user **per cafeteria** by the cafeteria administrator (or the system
administrator). Administrators have all of them in their cafeterias. A supervisor
is an agent with more than the defaults.

| Permission | Allows |
| --- | --- |
| `pos` | scan a student and sell at the counter (default) |
| `menu_propose` | propose a menu item; it waits for a price and approval (default) |
| `menu_manage` | create, price, edit and remove menu items |
| `inventory_view` | see stock quantities |
| `inventory_manage` | adjust stock and stock tracking |
| `sales_view` | sales totals and purchase history |
| `balances_view` | student account balances and limits |
| `transfers_review` | approve or reject parents' bank transfers, open receipts |
| `reports` | export reports |
| `presence_view` | **administrators only, never given to an agent**: see when agents arrived at and left the cafeteria (the log, who is inside now, the alert bar, e-mail alerts) |

A grant can never exceed the cafeterias the grantor administers. If an agent works
in a cafeteria the administrator does not manage, the administrator can change only
the assignment and permissions in his own cafeterias: not the name, the active flag,
the password, and he cannot delete the account.

## How to set it up

1. System administrator: create the cafeteria (name, school and bank details).
2. System administrator: create the cafeteria administrator and choose the
   cafeteria(s) he administers (at least one). Change them later with
   "Assign cafeterias" on the Staff tab.
3. Cafeteria administrator: set an alias if he has several cafeterias, create agents
   and tick their permissions.

## Existing deployments

Migration `0029_fushati_access_model.sql` assigns every cafeteria administrator that
exists today to every cafeteria that exists today, so nobody is locked out when it
is deployed. **Review this right after deploying**: open the Staff tab as the system
administrator and remove each administrator from the cafeterias that are not his.
Cafeterias created afterwards are reachable only by the administrators assigned to
them.

## Map, arrival and departure (phase 3)

Code: `app/api/fushati/presence/route.ts`, `lib/fushati/presence.ts`, `lib/fushati/location.ts`
(the rules, shared by the server and the phone), `components/osm-map.tsx`,
`app/fushati/presence-panel.tsx` (administrator) and `app/fushati/agent-presence.tsx` (agent).
Tests: `scripts/test-location.mjs` and `scripts/test-cafeteria-presence.mjs`.

**Where a cafeteria is.** Only the system administrator sets it (Map & attendance tab: click the map at the
cafeteria door or school gate, or type the coordinates, plus an arrival radius, default 150 m). Until it is set
the cafeteria shows as "no map location" and agents cannot check in.

**Arrival.** There is nothing for the agent to turn on or press, and he sees nothing of this feature (no card, no
button, no map, no log). His phone follows its own position and, when it is inside the arrival circle of one of his
cafeterias (allowing for the phone's stated uncertainty, at most 100 m; a position vaguer than 150 m is ignored),
reports one thing: "arrived". The server checks the same rule once, so a phone cannot report an arrival anywhere
but at the cafeteria's point. The only notice to the agent is one line in the page footer, the operating system's
own location permission, and the standing notification Android shows while the app follows the position.

**Departure.** Two reports in a row clearly outside the circle (radius plus 50 m) make the phone report "left".
A phone that was offline reports late with the time it saw the event (accepted if not in the future and not older
than 12 hours); the administrator's alert still comes when the server hears. A stay with no departure for 16
hours is "not confirmed": it is closed at the last confirmation without inventing a departure time or a length,
and it is not announced as a departure. An administrator can also end a stay that was forgotten.

**Who is told.** Only administrators (the cafeteria's administrator, and the system administrator). An alert bar at the
top of every page of their dashboard says "Sara arrived at Main 07:12" / "left" within about 30 seconds while the
page is open. A cafeteria administrator can switch on an e-mail for every arrival and departure in his cafeterias
(*Attendance* tab; off by default; uses the same mail settings as invitations; a mail that cannot be sent never
affects the agent). Push notifications to the phone are not built yet (they need a Firebase project and an Apple key).

**Privacy.** The agent's position is looked at once, on arrival, and is never stored: `fushati_visits` keeps the times,
the distance at arrival, the accuracy and the reason, and its coordinate columns stay empty (rows from before
migration `0033` lose their coordinates after 30 days). Nobody can see where an agent is, now or later.
In a browser the position arrives only while the page is open, so the record is best effort; the Android / iOS app
follows it in the background. Location is device-reported and can be faked by a determined person; treat the log as
attendance, not proof.

**Sign-in stamps** are separate and for everybody: each successful sign-in (every role) writes the time, who, the
school and whether it came from the website or the app, into `khotwa_login_stamps` (migration `0033`). No position,
no IP address, no device identifier, for anyone. Stamps older than 180 days are removed as new ones arrive.

**Map tiles** come from OpenStreetMap (`tile.openstreetmap.org`, the only third-party host the app loads from); the
tile server sees the viewer's IP address and which area was viewed, as with any map. For heavy use, move to a tile
provider with an account (the component takes one URL function).

## Inventory and reports (phase 2)

Code: `app/api/fushati/inventory/route.ts`, `lib/fushati/stock.ts` (stock), `app/api/fushati/reports/route.ts`,
`lib/fushati/reports.ts` (reports), `app/api/fushati/backup/route.ts`, `lib/fushati/backup.ts` (backup), migration `0031`.
Tests: `scripts/test-cafeteria-inventory.mjs`, `test-cafeteria-reports.mjs`, `test-cafeteria-backup.mjs`.

**Stock.** An item's stock is tracked or not. For a tracked item the count changes only by a *movement*, written
in one batch with the guarded update of the count, so the count and the history cannot disagree and two people
writing off the same stock at once cannot make it negative. Kinds: *opening*, *receipt* (may set the cost price),
*return*, *waste*, *damage*, *expired*, *stocktake* (the number counted; the movement is the difference worked
out at that moment). Sales take stock off through the purchase trigger (migration 0028). Sending the same request id
twice changes the stock once. Seeing stock needs `inventory_view`, changing it needs `inventory_manage`, in that
cafeteria. An item of another cafeteria answers like one that does not exist.

New kinds are stored as reason `correction` plus a `kind` column, because changing the `reason` CHECK would mean
rebuilding the table and the purchase trigger that writes to it.

**Reports.** Thirteen reports, all totals (no student, parent or position): sales by day, hour, item, category and
agent; estimated margin; bank top-ups; balances summary; current stock; items to reorder; stock movement; waste;
agent attendance. To open one a user needs `reports` **and** the permission for its kind of data in that cafeteria
(sales reports: `sales_view`; top-ups and balances: `balances_view`; stock reports: `inventory_view`; attendance:
`presence_view`). "All cafeterias" means the cafeterias where he has both, never one more. Periods are Saudi days,
at most 366 days, default the last 30. A report can be downloaded as CSV (Arabic or English headers, UTF-8 with
byte-order mark, a cell that starts with `= + - @` is prefixed so a spreadsheet cannot run it as a formula).
The margin report uses the cost price recorded for each item today, so it is an estimate, and items with no cost
price are left out of cost and margin.

**Backup.** `GET /api/fushati/backup` (system administrator only) downloads the cafeteria tables, which the school
backup (`/api/backup`) never held: cafeterias and bank details, staff and assignments, menu, stock and its history,
student accounts, bank transfers, purchases, the ledger, alerts, stays, audit. It never contains password hashes,
student card secrets, sign-in link hashes or agent coordinates, and says so in the file. Receipt images are in
file storage and are not in it. Every column of every `fushati_*` table is listed in `lib/fushati/backup.ts` as
included or left out; the test fails when a migration adds a column that is neither, so a new secret cannot be
exported by accident.

**Retention of agent positions.** A finished stay keeps its times, distance and reason; its coordinates are blanked
30 days after it ended (`POSITION_RETENTION_DAYS`). A stay whose phone went silent is first closed at its last
report. There is no scheduled job in this deployment, so this runs when an agent checks in; it is safe to repeat.

## Products by barcode

Code: `lib/fushati/barcode.ts` (rules), `app/api/fushati/inventory/route.ts` (`op=barcode`, `op=scan`), `app/fushati/scan-panel.tsx`,
`app/fushati/menu-panel.tsx`, migration `0032`. Tests: `scripts/test-cafeteria-barcode.mjs`, `test-cafeteria-ui.mjs`.

A product can carry the barcode printed on the item (`fushati_menu_items.barcode`, 4 to 32 letters and digits, unique
within a cafeteria, shared freely across cafeterias). The scan screen reads it with a USB or Bluetooth scanner (they type
the code and press Enter), the phone camera (`@zxing/browser`), or the keyboard.

- **A barcode the cafeteria already knows** needs only the quantity: `op=scan` with the quantity records a *receipt*, so
  the history, the cost price and the "same request sent twice counts once" rule are those of every other stock movement.
  A product that was not tracked starts being tracked with this first quantity.
- **A new barcode** asks once for the name (and the price, for those who may set one) and creates the product; every later
  scan is quantity-only. A proposer (`menu_propose` without `menu_manage`) creates the product at price 0, not for sale,
  waiting for the administrator, exactly as when adding by hand; the price a proposer sends is ignored.
- **Permissions.** Looking a barcode up needs any of `menu_propose`, `menu_manage`, `inventory_view`,
  `inventory_manage` in that cafeteria and answers with what the person may do (`can.create/price/stock/viewStock`);
  adding quantity needs `inventory_manage`. A proposer who is not allowed to add stock still gets the product created, and
  the answer says the stock part was refused (`stock_forbidden`).
- **Check digit.** An all-digit code of length 8, 12, 13 or 14 must have a valid GS1 check digit, which catches most
  mis-scans; other codes (shorter, longer, with letters) are accepted as they are.
- **No online product lookup.** Product names are not fetched from a public database, because that would send the
  cafeteria's barcodes to a third party. The name is typed once per product.
- **Backup.** `barcode` is in the included columns of `fushati_menu_items`.
