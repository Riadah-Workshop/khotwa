import {db, now} from './core';

// A copy of the cafeteria data (the Fushati tables), for the system administrator. The school backup (/api/backup)
// holds school tables; the cafeterias, their money records and their staff live in separate shared tables and
// were not in it.
//
// Every column of every table is either listed in `include` or in `leftOut`. The test fails when a migration adds a
// column that is in neither, so a new secret is never exported by accident, and a new field is never forgotten.
export const BACKUP_TABLES: Record<string, {include: string[]; leftOut: string[]}> = {
  fushati_cafeterias: {include: ['id', 'school_id', 'name', 'alias', 'bank_name', 'iban', 'beneficiary', 'active', 'latitude', 'longitude', 'arrival_radius_m', 'created_at'], leftOut: []},
  fushati_users: {include: ['id', 'email', 'login_identifier', 'full_name', 'phone', 'role', 'active', 'must_change_password', 'session_version', 'activated_at', 'created_at', 'presence_email'], leftOut: ['password_hash']},
  fushati_assignments: {include: ['user_id', 'cafeteria_id', 'permissions'], leftOut: []},
  fushati_menu_items: {include: ['id', 'cafeteria_id', 'name', 'category', 'price_minor', 'active', 'available', 'created_by', 'created_at', 'barcode'], leftOut: []},
  fushati_inventory: {include: ['menu_item_id', 'tracked', 'on_hand', 'low_stock_threshold', 'cost_minor', 'updated_at'], leftOut: []},
  fushati_stock_movements: {include: ['id', 'menu_item_id', 'delta', 'reason', 'kind', 'note', 'unit_cost_minor', 'reference_id', 'actor_id', 'created_at'], leftOut: []},
  fushati_accounts: {include: ['id', 'school_id', 'cafeteria_id', 'student_id', 'balance_minor', 'daily_limit_minor', 'monthly_limit_minor', 'allowed_item_ids', 'active', 'spent_day_minor', 'spent_month_minor', 'day_key', 'month_key', 'created_at'], leftOut: ['card_nonce']},
  fushati_transfers: {include: ['id', 'account_id', 'cafeteria_id', 'parent_phone', 'amount_minor', 'bank_reference', 'destination_iban', 'receipt_key', 'receipt_mime', 'status', 'review_note', 'reviewed_by', 'reviewed_at', 'created_at'], leftOut: []},
  fushati_purchases: {include: ['id', 'account_id', 'cafeteria_id', 'agent_id', 'items_json', 'total_minor', 'day_key', 'month_key', 'posted', 'created_at'], leftOut: []},
  fushati_ledger: {include: ['id', 'account_id', 'amount_minor', 'entry_type', 'reference_id', 'description', 'day_key', 'month_key', 'created_at'], leftOut: []},
  fushati_attendance_alerts: {include: ['id', 'cafeteria_id', 'school_id', 'student_id', 'parent_phone', 'agent_id', 'day_key', 'detail', 'created_at'], leftOut: []},
  fushati_visits: {include: ['id', 'user_id', 'cafeteria_id', 'day_key', 'arrived_at', 'arrive_accuracy_m', 'arrive_distance_m', 'last_accuracy_m', 'last_seen_at', 'left_at', 'leave_reason', 'arrival_logged_at', 'departure_logged_at'], leftOut: ['arrive_lat', 'arrive_lng', 'last_lat', 'last_lng']},
  fushati_audit: {include: ['id', 'actor_id', 'operation', 'target_type', 'target_id', 'detail', 'created_at'], leftOut: []},
  // Single-use sign-in links: nothing to restore, and the hashes are secrets.
  fushati_invites: {include: [], leftOut: ['id', 'user_id', 'token_hash', 'expires_at', 'consumed_at', 'created_at']},
};

const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

export async function exportCafeteriaData() {
  const tables = Object.entries(BACKUP_TABLES).filter(([, def]) => def.include.length);
  // One batch is one consistent read of every table.
  const results = await db().batch(tables.map(([table, def]) => db().prepare(`SELECT ${def.include.join(',')} FROM ${table}`)));
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  tables.forEach(([table], index) => {
    const rows = results[index].results as Record<string, unknown>[];
    data[camel(table.replace(/^fushati_/, ''))] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value])));
    counts[table] = rows.length;
  });
  return {
    format: 'khotwa-cafeteria-v1',
    exportedAt: now(),
    counts,
    // Said in the file so nobody assumes it is complete.
    notIncluded: {
      passwordsAndCardSecrets: 'Password hashes, student card secrets and sign-in link hashes are never exported.',
      agentPositions: 'Agent map coordinates are not exported (only times and distances).',
      transferReceiptFiles: 'Receipt images are stored separately in file storage (R2); only their keys are here.',
      schoolData: 'Students, attendance and cases are in the school backup (/api/backup).',
    },
    ...data,
  };
}
