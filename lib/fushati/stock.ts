import {db} from './core';

// Stock movements for one menu item. Every change to the stock of an item is a row in fushati_stock_movements
// and one guarded update of fushati_inventory, written together in one batch, so the count and the history
// cannot disagree and two people changing the same item at once cannot make it negative.
//
// Sales are not recorded here: the purchase trigger (migration 0028) takes them off and writes their movement.
export const STOCK_KINDS = ['opening', 'receipt', 'return', 'waste', 'damage', 'expired', 'stocktake'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

/** How a kind is stored: the old `reason` column (unchanged CHECK) and the finer `kind` column. */
const STORED: Record<StockKind, {reason: 'opening' | 'receipt' | 'correction'; kind: '' | 'waste' | 'damage' | 'expired' | 'return' | 'stocktake'; direction: 'add' | 'remove' | 'count'}> = {
  opening: {reason: 'opening', kind: '', direction: 'add'},
  receipt: {reason: 'receipt', kind: '', direction: 'add'},
  return: {reason: 'correction', kind: 'return', direction: 'add'},
  waste: {reason: 'correction', kind: 'waste', direction: 'remove'},
  damage: {reason: 'correction', kind: 'damage', direction: 'remove'},
  expired: {reason: 'correction', kind: 'expired', direction: 'remove'},
  stocktake: {reason: 'correction', kind: 'stocktake', direction: 'count'},
};

/** The name a report or screen uses for a stored movement. */
export function movementLabelKey(reason: string, kind: string): string {
  if (kind) return kind;
  return reason; // opening, receipt, purchase, correction
}

export type StockMove = {
  menuId: string;
  kind: StockKind;
  /** Units added or removed; for a stock count, the number counted. */
  quantity: number;
  note: string;
  /** Cost of one unit, in halalas. Only a receipt may set it. */
  unitCostMinor: number | null;
  /** Makes a double tap harmless: the same request id is applied once. */
  requestId: string;
  actorId: string;
  stamp: string;
};

export type StockResult =
  | {ok: true; duplicate: boolean; onHand: number; delta: number}
  | {ok: false; code: 'untracked' | 'insufficient' | 'unknown'; onHand: number};

export async function moveStock(move: StockMove): Promise<StockResult> {
  const stored = STORED[move.kind];
  const before = await db().prepare('SELECT tracked,on_hand FROM fushati_inventory WHERE menu_item_id=?').bind(move.menuId).first<{tracked: number; on_hand: number}>();
  if (!before) return {ok: false, code: 'unknown', onHand: 0};
  if (!before.tracked) return {ok: false, code: 'untracked', onHand: before.on_hand};
  const cost = move.kind === 'receipt' ? move.unitCostMinor : null;
  const columns = 'id,menu_item_id,delta,reason,kind,note,unit_cost_minor,reference_id,actor_id,created_at';
  const statements = [];
  let expectedDelta = move.quantity;

  if (stored.direction === 'add') {
    statements.push(
      db().prepare(`INSERT INTO fushati_stock_movements(${columns}) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fushati_inventory WHERE menu_item_id=? AND tracked=1)`)
        .bind(crypto.randomUUID(), move.menuId, move.quantity, stored.reason, stored.kind, move.note, cost, move.requestId, move.actorId, move.stamp, move.menuId),
      db().prepare('UPDATE fushati_inventory SET on_hand=on_hand+?,cost_minor=COALESCE(?,cost_minor),updated_at=? WHERE menu_item_id=? AND tracked=1').bind(move.quantity, cost, move.stamp, move.menuId),
    );
  } else if (stored.direction === 'remove') {
    expectedDelta = -move.quantity;
    // The cost in force today is written on the movement so a loss keeps its value when the price changes.
    statements.push(
      db().prepare(`INSERT INTO fushati_stock_movements(${columns}) SELECT ?,?,?,?,?,?,cost_minor,?,?,? FROM fushati_inventory WHERE menu_item_id=? AND tracked=1 AND on_hand>=?`)
        .bind(crypto.randomUUID(), move.menuId, -move.quantity, stored.reason, stored.kind, move.note, move.requestId, move.actorId, move.stamp, move.menuId, move.quantity),
      db().prepare('UPDATE fushati_inventory SET on_hand=on_hand-?,updated_at=? WHERE menu_item_id=? AND tracked=1 AND on_hand>=?').bind(move.quantity, move.stamp, move.menuId, move.quantity),
    );
  } else {
    // A count: the movement is the difference, worked out inside the same transaction from the number on hand
    // at that moment, so a sale that lands while someone is counting is not lost.
    statements.push(
      db().prepare(`INSERT INTO fushati_stock_movements(${columns}) SELECT ?,?,?-on_hand,?,?,?,cost_minor,?,?,? FROM fushati_inventory WHERE menu_item_id=? AND tracked=1 AND on_hand<>?`)
        .bind(crypto.randomUUID(), move.menuId, move.quantity, stored.reason, stored.kind, move.note, move.requestId, move.actorId, move.stamp, move.menuId, move.quantity),
      db().prepare('UPDATE fushati_inventory SET on_hand=?,updated_at=? WHERE menu_item_id=? AND tracked=1').bind(move.quantity, move.stamp, move.menuId),
    );
  }

  let results;
  try {
    results = await db().batch(statements);
  } catch (error) {
    // UNIQUE(menu_item_id, reason, reference_id): the same request id arrived twice. The whole batch was rolled back.
    if (/UNIQUE/i.test(String((error as Error)?.message))) {
      const now = await db().prepare('SELECT on_hand FROM fushati_inventory WHERE menu_item_id=?').bind(move.menuId).first<{on_hand: number}>();
      return {ok: true, duplicate: true, onHand: now?.on_hand ?? 0, delta: 0};
    }
    throw error;
  }
  const inserted = results[0].meta.changes;
  if (stored.direction !== 'count' && inserted !== 1) {
    const now = await db().prepare('SELECT tracked,on_hand FROM fushati_inventory WHERE menu_item_id=?').bind(move.menuId).first<{tracked: number; on_hand: number}>();
    return {ok: false, code: now?.tracked ? 'insufficient' : 'untracked', onHand: now?.on_hand ?? 0};
  }
  const after = await db().prepare('SELECT on_hand FROM fushati_inventory WHERE menu_item_id=?').bind(move.menuId).first<{on_hand: number}>();
  let delta = expectedDelta;
  if (stored.direction === 'count') {
    // The difference was worked out inside the batch; read it back instead of guessing from the earlier count.
    const written = inserted === 1 ? await db().prepare('SELECT delta FROM fushati_stock_movements WHERE menu_item_id=? AND reason=? AND reference_id=?').bind(move.menuId, stored.reason, move.requestId).first<{delta: number}>() : null;
    delta = written?.delta ?? 0;
  }
  return {ok: true, duplicate: false, onHand: after?.on_hand ?? 0, delta};
}

/** Turn stock tracking on or off for an item and set its warning level and cost price. */
export async function setupStock(menuId: string, tracked: boolean, threshold: number, costMinor: number | null, stamp: string) {
  return db().prepare('UPDATE fushati_inventory SET tracked=?,low_stock_threshold=?,cost_minor=COALESCE(?,cost_minor),updated_at=? WHERE menu_item_id=?').bind(tracked ? 1 : 0, threshold, costMinor, stamp, menuId).run();
}
