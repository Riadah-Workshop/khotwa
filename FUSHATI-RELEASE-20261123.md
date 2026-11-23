# Khotwa × فسحتي | Fushati — integration release (2026-11-23)

## Baseline / scope

These files modify **khotwa-main(7).zip** only; the **maqsaf-school-cafeteria-platform.zip** FastAPI prototype was used as a feature reference, **not** added as a second running server or database. Existing Khotwa admin, Student Affairs Agent, school manager, and parent portals are kept. Two dedicated Fushati roles and login paths are added, while parents use their original account.

## What is included

- Fushati Admin (multiple cafeterias): cafeterias linked to pre-existing schools; agents; product approvals/prices; bank-transfer receipt review; account balances; sales reporting; CSV export and print-to-PDF.
- Fushati Agent (assigned cafeterias only): QR student lookup, checkout, pending product submissions. Agents **cannot** set prices, approve bank transfers, administer users, edit schools, or view other cafeterias.
- Parent Fushati tab for each linked child: balances, daily and monthly limits, allowed products, purchase activation, 10-minute signed QR, bank details, proof-of-transfer upload, transaction history. No payment gateway is implemented.
- School manager: read-only cafeteria counts and total sales scoped to the school.
- Private R2 object storage for receipt attachments; SQL controls for idempotency, credit/debit accounting, daily/monthly limits and permitted products; audit history.

## Authentication and first-time setup

- Existing system admin: `https://khotwa-ksa.com/admin-login`. From the system admin console open **فسحتي** (or `/fushati/admin`); create a cafeteria tied to an **existing school**.
- Fushati admin: `https://khotwa-ksa.com/fushati-admin-login` → `/fushati/admin`.
- Fushati agent: `https://khotwa-ksa.com/fushati-agent-login` → `/fushati/agent`.
- Parent: existing `https://khotwa-ksa.com/parent-login` → `/parent`; choose a child to see **فسحتي**.
- Main admin creates Fushati admin user; Fushati admin (or main admin) creates cafeteria agents and their assignments. The page displays a **one-time temporary password**; it must be shared securely and the new user must change it at first login. Automatic invitation email for these new accounts is **not** part of this release.
- Set cafeteria `bank_name`, `beneficiary`, `iban` before the parent can submit a transfer receipt. Verify all receipts against the **real bank statement** before clicking Approve. The application cannot itself confirm receipt of funds.
- **Important**: An agent-added product is submitted pending. A Fushati admin sets the price and approves it before it becomes purchasable.

## Install / Coolify deployment

1. **Back up the running database and persistent `/data/state` directory**, as well as the R2 storage bucket. Test restoration. Do **not** purge the volume or redeploy without a backup.
2. Use the **modified-files ZIP** on top of the exact `khotwa-main(7).zip` baseline. Preserve all relative paths under `khotwa-main/`. Alternatively use the complete merged source ZIP. Do not combine with another later source snapshot without reviewing conflicts.
3. Confirm existing production Cloudflare Worker bindings: `DB`, `BUCKET` (private R2), `KHOTWA_SESSION_SECRET` (a stable random value ≥32 characters), admin credentials, and `KHOTWA_PUBLIC_ORIGINS`. No extra third-party email or payment secrets are required for this module.
4. Deploy to **staging first** and review startup logs. The existing Khotwa DB migration runner loads `drizzle/*.sql` and will pick up `drizzle/0027_fushati_cafeteria.sql`. **Do not manually re-run** the migration after the startup runner has recorded it. Check that the new tables and SQL triggers exist.
5. Login with an existing main admin and create a cafeteria in an existing school. Create new Fushati admin and agent accounts, sign in to their dedicated login pages, change their one-time passwords, and add/approve priced menu items.
6. Use an existing authorized parent/student pair in the same school. Verify parent restrictions; submit a small test receipt **without any real transfer** for staging, approve the staged transfer, scan the QR from a phone/tablet, purchase a test product, and confirm the balance is debited once in the UI and ledger. Do not approve staging receipts in production.
7. Test cross-school denial, inactive student/cafeteria/agent, an exhausted daily limit, insufficient funds, repeated receipt reference, duplicate checkout request ID, and deletion with financial history before production rollout.

## Validation performed in the provided environment

- `python3 scripts/test-fushati-ledger.py` — **pass**: SQLite balance trigger, daily/monthly budget, duplicate ledger entry, inactive account.
- `node --experimental-strip-types scripts/test-fushati-auth.mjs` — **pass**: separate logins, role-scoped restrictions, revoked accounts.
- Existing Khotwa authentication, multi-school auth, tenancy isolation and request-origin tests — **pass**.
- Individual new TS/TSX modules parsed successfully with TypeScript syntax diagnostics.
- Exact sample credit and purchase posting SQL tested against SQLite.
- **Not completed in this environment:** full application build, end-to-end Cloudflare Worker/D1/R2 execution, camera and mobile-browser testing. Dependency installation was blocked by unavailable external package-registry access (`EAI_AGAIN`), so this should be treated as a staging candidate, **not** an independently production-validated release.

## Operational / design notes

- Fushati is **Arabic-first**. Complete English translation of its new admin/agent/parent module is not yet implemented.
- CSV export is implemented. PDF reports are available through browser **Print → Save as PDF** (not a separate templated PDF generator).
- Financial history is preserved: delete attempts against cafeterias/accounts/products with dependent activity are rejected or are handled as deactivate rather than deleting transaction history.
- Parent-linked students and cross-school shared parent identities are reused. No duplicate users/students are imported from Maqsaf.
- Store real student and bank-transfer data only on access-controlled production infrastructure; review local Saudi privacy and financial obligations before launch.
