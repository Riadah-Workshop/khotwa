// One cafeteria per school (default, a, b) with a marked menu item (with tracked stock), account, posted purchase and
// pending bank transfer, so cafeteria tests start from the same data. Not a test.
//
// Ids are UUIDs because the cafeteria route only accepts those. Nobody is assigned to anything yet.
import {uuid} from './school-harness.mjs';

export async function seedCafeterias({DB, seeded, schoolByKey}) {
  const now = '2026-11-02T08:00:00.000Z';
  const cafe = {}, menu = {}, transfer = {}, student = {};
  for (const key of ['default', 'a', 'b']) {
    const school = schoolByKey[key];
    cafe[key] = uuid(school, 2);
    menu[key] = uuid(school, 3);
    transfer[key] = uuid(school, 4);
    student[key] = seeded[school.id].students.id;
    await DB.prepare('INSERT INTO fushati_cafeterias(id,school_id,name,active,created_at) VALUES(?,?,?,1,?)').bind(cafe[key], school.id, `${school.marker}:cafeteria`, now).run();
    await DB.prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at) VALUES(?,?,?,?,?,1,1,?,?)').bind(menu[key], cafe[key], `${school.marker}:menu`, 'general', 300, 'seed', now).run();
    // The inventory row may already exist (created with the menu item), so insert or update.
    await DB.prepare('INSERT INTO fushati_inventory(menu_item_id,tracked,on_hand,low_stock_threshold,updated_at) VALUES(?,1,7,5,?) ON CONFLICT(menu_item_id) DO UPDATE SET tracked=1,on_hand=7,low_stock_threshold=5').bind(menu[key], now).run();
    await DB.prepare('INSERT INTO fushati_accounts(id,school_id,cafeteria_id,student_id,balance_minor,created_at) VALUES(?,?,?,?,?,?)').bind(`acct-${key}`, school.id, cafe[key], student[key], 5000, now).run();
    await DB.prepare('INSERT INTO fushati_purchases(id,account_id,cafeteria_id,agent_id,items_json,total_minor,day_key,month_key,posted,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)').bind(`purchase-${key}`, `acct-${key}`, cafe[key], 'seed', JSON.stringify([{name: `${school.marker}:purchase`}]), 500, '2026-11-02', '2026-11', now).run();
    await DB.prepare('INSERT INTO fushati_transfers(id,account_id,cafeteria_id,parent_phone,amount_minor,bank_reference,destination_iban,receipt_key,receipt_mime,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(transfer[key], `acct-${key}`, cafe[key], `05${school.digits}`, 1000, `${school.marker}-ref`, `SA-${school.marker}`, 'receipt', 'image/png', now).run();
  }
  const assign = (userId, cafeteriaId, permissions) => DB.prepare('INSERT INTO fushati_assignments(user_id,cafeteria_id,permissions) VALUES(?,?,?)').bind(userId, cafeteriaId, JSON.stringify(permissions)).run();
  return {cafe, menu, transfer, student, assign};
}
