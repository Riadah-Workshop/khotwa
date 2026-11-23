# Khotwa + Fushati enhancements — 23 November 2026

Source basis: `khotwa-main(9).zip`. All original files not listed in the replacement manifest are preserved. This is an ADDITIVE change set, not a database reset.

## New functionality

1. **School classification:** Khotwa Admin can choose Kindergarten, Elementary, Intermediate, Secondary / High School, or Other / All stages when creating or editing a school. Existing schools remain `general` unless edited.
2. **Main Administrator security:** Khotwa Admin has an email/password form, requiring the current password and at least 12 characters for a new password. The override is saved in D1; the admin's signed sessions are invalidated, requiring login with the updated credentials. Original Coolify environment credentials bootstrap only when no DB override exists.
3. **Switch between platforms:** Khotwa System Admin has a **Back to Khotwa Admin** link in the Fushati management dashboard. Regular Fushati users cannot use this to enter the system admin portal.
4. **Absent student protection:** Fushati checks Khotwa's attendance table for the school and the current **Asia/Riyadh date** at checkout. If that student's latest record is explicitly `absent`, it rejects the purchase with a 409 response **before** posting a charge or reducing stock. A de-duplicated attempted-card-use alert is saved for that student's linked parent and shown in the Parent Portal's Fushati history. Missing/unmarked attendance is *not* treated as absent. This release implements **in-portal notification**, not a push/SMS/WhatsApp message; it should be described as a *suspected misuse attempt*, not proven fraud.
5. **Permanent printed student cards:** Parent Portal now generates a stable HMAC-signed Fushati QR for each student/cafeteria. The parent can print a card or revoke an old card and issue a replacement. Each QR is restricted to one student and cafeteria, and does not contain the student's phone or personal name. Previous expiring session QR codes remain valid for their existing 10-minute lifespan.
6. **English views:** Arabic/English switches for all six login pages, Fushati Admin/Agent dashboards, and the shared Parent Portal/Fushati parent section; existing Khotwa System Admin, Student Affairs Agent and School Manager localization is retained. English interface coverage includes key controls, tables, prompts and labels; stored Arabic school names, original case texts, and server error messages remain source-language content rather than machine-translated.
7. **Cafeteria categories & inventory:** product category dropdown (Meals, Sandwiches, Drinks, Fruit & Vegetables, Snacks, Desserts, Dairy, School Supplies, Other), per-product optional inventory tracking, stock receipts/corrections, minimum-stock threshold, audit movements, and automatic decrements in the same SQLite transaction as purchase posting. Overselling tracked products is denied. Existing products start **untracked** to preserve current sales until each product's opening stock is entered.
8. **Staff onboarding:** newly created Fushati Admin accounts receive a one-time activation URL through existing Hostinger SMTP and choose their own password (48-hour expiration). Fushati Agents use a Saudi mobile number or 10-digit National ID/Iqama plus a generated temporary password; first sign-in requires replacing that password. Existing Fushati manager and agent accounts preserve their previous login where needed for backward compatibility.

## Deployment — critical

1. Back up the **Coolify persistent `/data/state` volume** and current repository version before changing anything. Do not erase the D1 SQLite state or reset migrations.
2. Copy the contents of `khotwa-v10-fushati-modified-files-20261123.zip` **into the GitHub Khotwa source repository root**, keeping all original paths. Or use the complete merged source archive. Only one method is needed.
3. Commit and push so Coolify sees a **new Git commit SHA** and rebuilds the image; the previous screenshot showed build reuse for unchanged commits.
4. Confirm the existing Hostinger SMTP environment configuration works (`KHOTWA_FROM_EMAIL`, `KHOTWA_SMTP_USER`, `KHOTWA_SMTP_PASSWORD`, and related SMTP/relay settings). Fushati Admin invitations require this service, and mail-server acceptance alone does not guarantee delivery to the inbox.
5. In Coolify staging, verify the startup migration runs `0028_khotwa_fushati_enhancements.sql` **after 0027**. No manual deletion or DB reinitialization is necessary. The stock trigger intentionally avoids nested `CASE ... END` so Wrangler does not split the SQL incorrectly.
6. Verify a full redeploy, then test all six login pages and the eight feature workflows below before updating production.

### Suggested acceptance tests

- Create/edit a school stage, and confirm original school records remain unchanged.
- Change system admin login email and password; confirm the old session and old password are rejected and new credentials work.
- Enter Fushati from Khotwa System Admin, then use the return link. Confirm a Fushati Admin is not upgraded to system admin.
- Mark a student **absent today**, attempt a QR purchase, verify it is rejected without charge, and confirm the parent can view an alert for that linked child. Confirm a present student can buy.
- Print QR, sign out/in, scan the same card again, then revoke the card and ensure the old QR is denied.
- Open each login and all role dashboards in English, verify navigation/buttons and Arabic toggle.
- Enable tracking with an opening stock of 2, sell 1 and verify stock=1; attempt to sell 2 and confirm the transaction fails and balance is unchanged; confirm low-stock thresholds appear.
- Create Fushati Admin via email invitation and activate, then create agent via mobile/Iqama + temporary password and require password change.

### Test execution in the source folder

```bash
node --experimental-strip-types scripts/test-fushati-auth.mjs
node --experimental-strip-types scripts/test-khotwa-auth.mjs
node --experimental-strip-types scripts/test-deputy-invitations.mjs
node --experimental-strip-types scripts/test-multischool-auth.mjs
node --experimental-strip-types scripts/test-shared-parent-locations.mjs
python3 scripts/test-fushati-ledger.py
python3 scripts/test-fushati-enhancements.py
```

All of the above tests passed in the provided testing environment. The SQL migration was also applied against a fresh SQLite database across all 29 migrations without errors. **A complete Next.js/Vinext production build, live HTTP integration, SMTP deliverability and Coolify deployment were not verifiable in the offline environment**, so please deploy to staging and inspect actual Runtime Logs before production.

### Operational limits / notes

- No external WhatsApp/SMS push alert is added. Absence/misuse warnings appear in the existing Fushati Parent Portal.
- Existing cafeteria products remain untracked until a Fushati Admin enters actual stock counts. This avoids unexpectedly blocking sales after upgrading.
- The printed QR is permanent unless intentionally replaced, the student/cafeteria account is deactivated, or the session signing secret is changed. **Keep `KHOTWA_SESSION_SECRET` persistent** to avoid invalidating all previously printed cards.
- Administrator email changes currently require current-password confirmation, but do not include a second email-verification step.
- If you have already stored changed admin credentials in D1, changing only Coolify's old admin environment email/password will *not* override them. Recover access through a controlled DB backup/recovery process.
