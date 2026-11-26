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
| `presence_view` | see agents on the map (name, phone, live position) and the arrival and departure log |

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

**Arrival.** The agent turns on *arrival detection* on his phone. The phone watches its own position; when it is
inside the arrival circle of one of his cafeterias (allowing for the phone's stated uncertainty, at most 100 m;
a position vaguer than 150 m is ignored) it records the arrival and he shows as available. The server checks the
same rule again, so a phone cannot check in anywhere but at the cafeteria's point. *Check in now* does the same by hand.

**Departure.** Two reports in a row clearly outside the circle (radius plus 50 m) record the departure; so does
*Check out*. If a phone goes silent for 30 minutes the stay is treated as ended at its last report (a dead battery
does not become a ten-hour shift). An administrator can also end a stay that was forgotten.

**Privacy.** Before arrival the position never leaves the phone. From arrival to departure the latest position is
stored (one row in `fushati_visits`, overwritten every ~30 s), shown only to people with `presence_view` in that
cafeteria, with the agent's name and phone number. Finished stays keep the times, the distance at arrival and the
reason, but no position. A web page cannot track in the background: the page must stay open on the agent's phone.
Location is browser-reported and can be faked by a determined person; treat the log as attendance, not proof.

**Map tiles** come from OpenStreetMap (`tile.openstreetmap.org`, the only third-party host the app loads from); the
tile server sees the viewer's IP address and which area was viewed, as with any map. For heavy use, move to a tile
provider with an account (the component takes one URL function).
