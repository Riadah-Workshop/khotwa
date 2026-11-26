// Pure helpers for the cafeteria inventory screen: labels, colours, the "what will the stock be" preview.
// No imports, so scripts/test-cafeteria-ui.mjs can load this file on its own.

export type StockStatus = 'ok' | 'low' | 'out' | 'untracked';
export type StockTone = 'green' | 'amber' | 'red' | 'slate';
export type KindTone = StockTone | 'blue';
export type StockItem = {
  id: string; name: string; category: string; priceMinor: number; active: boolean; available: boolean;
  tracked: boolean; onHand: number; threshold: number; costMinor: number | null; updatedAt: string; sold30d: number; status: StockStatus;
};
export type Movement = {id: string; menuId: string; item: string; delta: number; type: string; note: string; unitCostMinor: number | null; at: string; actor: string};
export type MoveKind = 'receipt' | 'return' | 'waste' | 'damage' | 'expired' | 'stocktake';
export type MoveEffect = 'add' | 'remove' | 'count';
export type Text = {ar: string; en: string};

/** The six things a person can record by hand. A sale is recorded by the till, never here. */
export const MOVE_KINDS: Array<{kind: MoveKind; effect: MoveEffect; label: Text; hint: Text; tone: KindTone}> = [
  {kind: 'receipt', effect: 'add', label: {ar: 'استلام بضاعة', en: 'Receive stock'}, hint: {ar: 'وصلت كمية جديدة من المورّد. يمكن تسجيل سعر تكلفة الوحدة.', en: 'A delivery arrived. You can record the unit cost.'}, tone: 'green'},
  {kind: 'return', effect: 'add', label: {ar: 'إرجاع إلى المخزون', en: 'Return to stock'}, hint: {ar: 'منتج صالح عاد إلى المخزون.', en: 'A good item came back to stock.'}, tone: 'blue'},
  {kind: 'waste', effect: 'remove', label: {ar: 'هدر', en: 'Waste'}, hint: {ar: 'كمية أُتلفت أثناء التحضير أو التقديم.', en: 'Thrown away while preparing or serving.'}, tone: 'amber'},
  {kind: 'damage', effect: 'remove', label: {ar: 'تلف', en: 'Damaged'}, hint: {ar: 'منتج تالف لا يصلح للبيع.', en: 'An item that cannot be sold.'}, tone: 'red'},
  {kind: 'expired', effect: 'remove', label: {ar: 'منتهي الصلاحية', en: 'Expired'}, hint: {ar: 'منتج انتهت صلاحيته.', en: 'An item past its date.'}, tone: 'red'},
  {kind: 'stocktake', effect: 'count', label: {ar: 'جرد', en: 'Stock count'}, hint: {ar: 'اكتب الكمية التي عددتها فعلاً؛ يصبح هذا هو المخزون.', en: 'Type what you actually counted; that becomes the stock.'}, tone: 'slate'},
];

const STATUS: Record<StockStatus, {tone: StockTone; label: Text}> = {
  ok: {tone: 'green', label: {ar: 'متوفر', en: 'In stock'}},
  low: {tone: 'amber', label: {ar: 'منخفض', en: 'Low'}},
  out: {tone: 'red', label: {ar: 'نفد', en: 'Out of stock'}},
  untracked: {tone: 'slate', label: {ar: 'غير متتبع', en: 'Not tracked'}},
};

export const statusTone = (status: StockStatus): StockTone => STATUS[status]?.tone || 'slate';
export const statusLabel = (status: StockStatus, en: boolean): string => (STATUS[status] ? (en ? STATUS[status].label.en : STATUS[status].label.ar) : status);

const MOVEMENT_NAMES: Record<string, Text> = {
  opening: {ar: 'رصيد افتتاحي', en: 'Opening balance'},
  receipt: {ar: 'استلام', en: 'Received'},
  purchase: {ar: 'بيع', en: 'Sale'},
  correction: {ar: 'تصحيح', en: 'Correction'},
  return: {ar: 'إرجاع', en: 'Returned'},
  waste: {ar: 'هدر', en: 'Waste'},
  damage: {ar: 'تلف', en: 'Damaged'},
  expired: {ar: 'منتهي الصلاحية', en: 'Expired'},
  stocktake: {ar: 'جرد', en: 'Stock count'},
};

/** How a stored movement type is shown; a type the screen does not know is shown as stored. */
export function movementLabel(type: string, en: boolean): string {
  const known = MOVEMENT_NAMES[type];
  return known ? (en ? known.en : known.ar) : type;
}

/** Items that need action first (out, then low), then the rest, each group by name. */
export function sortForAttention(items: StockItem[]): StockItem[] {
  const rank: Record<StockStatus, number> = {out: 0, low: 1, ok: 2, untracked: 3};
  return [...items].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

export type StockSummary = {tracked: number; low: number; out: number; untracked: number; valueMinor: number; withoutCost: number};

/** Counts for the tiles and the value of the stock on hand (only items with a cost price can be valued). */
export function summarize(items: StockItem[]): StockSummary {
  const summary: StockSummary = {tracked: 0, low: 0, out: 0, untracked: 0, valueMinor: 0, withoutCost: 0};
  for (const item of items) {
    if (!item.tracked) { summary.untracked += 1; continue; }
    summary.tracked += 1;
    if (item.status === 'low') summary.low += 1;
    if (item.status === 'out') summary.out += 1;
    if (item.costMinor === null || item.costMinor === undefined) { if (item.onHand > 0) summary.withoutCost += 1; }
    else summary.valueMinor += Math.max(0, item.onHand) * item.costMinor;
  }
  return summary;
}

/** What the stock will be after the move; null when the move cannot be applied. */
export function afterMove(onHand: number, kind: MoveKind, quantity: number): number | null {
  const effect = MOVE_KINDS.find(entry => entry.kind === kind)?.effect;
  if (!effect || !Number.isInteger(quantity) || quantity < 0) return null;
  if (effect === 'count') return quantity;
  if (quantity < 1) return null;
  if (effect === 'add') return onHand + quantity;
  return onHand - quantity < 0 ? null : onHand - quantity;
}

export type MoveProblem = 'quantity' | 'insufficient' | null;

export function moveProblem(onHand: number, kind: MoveKind, quantity: number): MoveProblem {
  const effect = MOVE_KINDS.find(entry => entry.kind === kind)?.effect;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return 'quantity';
  if (effect !== 'count' && quantity < 1) return 'quantity';
  if (effect === 'remove' && quantity > onHand) return 'insufficient';
  return null;
}

/** About how many days the stock lasts at the pace of the last 30 days; null when nothing was sold. */
export function daysOfCover(item: Pick<StockItem, 'tracked' | 'onHand' | 'sold30d'>): number | null {
  if (!item.tracked || item.sold30d <= 0) return null;
  return Math.max(0, Math.floor(item.onHand / (item.sold30d / 30)));
}

/** Halalas to riyals with thousands separators, e.g. 1245090 → "12,450.90". */
export function money(minor: number): string {
  return new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format((Number.isFinite(minor) ? minor : 0) / 100);
}

/** A cost typed by a person ("12.5", "١٢٫٥") as the text the server expects; null when it is not a usable amount. */
export function costInput(text: string): string | null {
  const latin = text.trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.');
  if (latin === '') return '';
  return /^\d{1,5}(\.\d{1,2})?$/.test(latin) ? latin : null;
}

/** Saudi time (UTC+3, no daylight saving) as "2026-11-26 14:05". */
export function saudiTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}
