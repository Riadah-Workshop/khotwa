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
