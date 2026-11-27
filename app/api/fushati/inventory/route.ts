import {env} from 'cloudflare:workers';
import {z, ZodError} from 'zod';
import {getKhotwaAccess, getChatGPTUser} from '../../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
import {audit, db, moneyMinor, mustChange, now, permittedCafeteria, response} from '../../../../lib/fushati/core';
import {moveStock, setupStock, STOCK_KINDS, type StockKind} from '../../../../lib/fushati/stock';
import {barcodeMessage, barcodeProblem, normalizeBarcode} from '../../../../lib/fushati/barcode';

// Stock of the menu items of one cafeteria: what is on hand, receiving, waste, stock counts and the history.
//
//   GET  ?op=items&cafeteriaId=            "inventory_view": every item with its stock, warning level, cost and 30-day sales
//   GET  ?op=history&cafeteriaId=[&menuId=][&days=]     "inventory_view": the movements, newest first
//   GET  ?op=barcode&cafeteriaId=&code=     who may add or receive products: the item with this barcode, and what the caller may do with it
//   POST setup                              "inventory_manage": track an item, its warning level and cost price
//   POST move                               "inventory_manage": receive, return, write off, or count
//   POST scan                               one scan: known barcode = receive the quantity; unknown = add the product once (and receive)
//
// The cafeteria is always checked against the signed-in user's own grants; an item is looked up by its id and
// then checked against the cafeteria it belongs to, so another cafeteria's item answers exactly like a missing one.
export const dynamic = 'force-dynamic';

const id = z.string().uuid();
const bodyModel = z.object({op: z.string().min(1).max(45), data: z.unknown()});
const fail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => response({error: message, code, ...extra}, status);
const DAY_MS = 86_400_000;
const MAX_UNITS = 100_000;

async function current() {
  const [access, user] = await Promise.all([getKhotwaAccess(), getChatGPTUser()]);
  return access && user ? {...access, userId: user.userId} : null;
}

const isStaff = (role: string) => role === 'main_admin' || role === 'fushati_admin' || role === 'fushati_agent';

export async function GET(req: Request) {
  const access = await current();
  if (!access) return fail('login', 'يرجى تسجيل الدخول', 401);
  if (!isStaff(access.role)) return fail('forbidden', 'غير مسموح', 403);
  try {
    if (await mustChange(access)) return fail('password', 'غيّر كلمة المرور المؤقتة أولاً', 403);
    const search = new URL(req.url).searchParams;
    const op = search.get('op') || 'items';
    if (op !== 'items' && op !== 'history' && op !== 'barcode') return fail('unknown', 'عملية غير متاحة', 400);
    const cafeteriaId = id.safeParse(search.get('cafeteriaId'));
    if (!cafeteriaId.success) return fail('input', 'المقصف غير صحيح', 400);

    if (op === 'barcode') {
      // Whoever may add products, receive stock or look at stock may ask what a barcode is.
      const code = normalizeBarcode(search.get('code') || '');
      const problem = barcodeProblem(code);
      if (problem) return fail('barcode', barcodeMessage(problem, 'ar'), 400, {problem});
      const [menuManage, menuPropose, stockView, stockManage] = await Promise.all(
        (['menu_manage', 'menu_propose', 'inventory_view', 'inventory_manage'] as const).map((permission) => permittedCafeteria(access, cafeteriaId.data, true, permission)),
      );
      const known = menuManage || menuPropose || stockView || stockManage;
      if (!known) return fail('forbidden', 'المقصف غير متاح', 403);
      const row = await db().prepare(
        `SELECT m.id,m.name,m.category,m.price_minor,m.active,m.available,m.barcode,inv.tracked,inv.on_hand,inv.low_stock_threshold,inv.cost_minor
         FROM fushati_menu_items m LEFT JOIN fushati_inventory inv ON inv.menu_item_id=m.id WHERE m.cafeteria_id=? AND m.barcode=?`,
      ).bind(known.id, code).first<{id: string; name: string; category: string; price_minor: number; active: number; available: number; barcode: string; tracked: number | null; on_hand: number | null; low_stock_threshold: number | null; cost_minor: number | null}>();
      const sees = !!(stockView || stockManage);
      return response({
        cafeteriaId: known.id,
        barcode: code,
        found: !!row,
        item: row ? {
          id: row.id, name: row.name, category: row.category, priceMinor: row.price_minor, active: !!row.active, available: !!row.available, barcode: row.barcode,
          ...(sees ? {tracked: !!row.tracked, onHand: row.on_hand ?? 0, threshold: row.low_stock_threshold ?? 5, costMinor: row.cost_minor ?? 0} : {}),
        } : null,
        can: {create: !!(menuManage || menuPropose), price: !!menuManage, stock: !!stockManage, viewStock: sees},
      });
    }
    const cafe = await permittedCafeteria(access, cafeteriaId.data, true, 'inventory_view');
    if (!cafe) return fail('forbidden', 'المقصف غير متاح', 403);
    const nowMs = Date.parse(now());

    if (op === 'items') {
      const since = new Date(nowMs - 30 * DAY_MS).toISOString();
      const items = (await db().prepare(
        `SELECT m.id,m.name,m.category,m.price_minor,m.active,m.available,inv.tracked,inv.on_hand,inv.low_stock_threshold,inv.cost_minor,inv.updated_at,
          COALESCE((SELECT -SUM(s.delta) FROM fushati_stock_movements s WHERE s.menu_item_id=m.id AND s.reason='purchase' AND s.created_at>=?),0) AS sold_30d
         FROM fushati_menu_items m JOIN fushati_inventory inv ON inv.menu_item_id=m.id WHERE m.cafeteria_id=? ORDER BY m.category,m.name`,
      ).bind(since, cafe.id).all<{id: string; name: string; category: string; price_minor: number; active: number; available: number; tracked: number; on_hand: number; low_stock_threshold: number; cost_minor: number; updated_at: string; sold_30d: number}>()).results;
      return response({
        cafeteriaId: cafe.id,
        canManage: !!(await permittedCafeteria(access, cafe.id, false, 'inventory_manage')),
        items: items.map((item) => ({
          id: item.id, name: item.name, category: item.category, priceMinor: item.price_minor, active: !!item.active, available: !!item.available,
          tracked: !!item.tracked, onHand: item.on_hand, threshold: item.low_stock_threshold, costMinor: item.cost_minor, updatedAt: item.updated_at, sold30d: item.sold_30d,
          status: !item.tracked ? 'untracked' : item.on_hand <= 0 ? 'out' : item.on_hand <= item.low_stock_threshold ? 'low' : 'ok',
        })),
      });
    }

    const days = Math.min(Math.max(Number(search.get('days') || 30) || 30, 1), 366);
    const menuIdText = search.get('menuId');
    const menuId = menuIdText ? id.safeParse(menuIdText) : null;
    if (menuId && !menuId.success) return fail('input', 'المنتج غير صحيح', 400);
    const since = new Date(nowMs - days * DAY_MS).toISOString();
    const rows = (await db().prepare(
      `SELECT s.id,s.menu_item_id,m.name AS item,s.delta,s.reason,s.kind,s.note,s.unit_cost_minor,s.created_at,COALESCE(u.full_name,'') AS actor
       FROM fushati_stock_movements s JOIN fushati_menu_items m ON m.id=s.menu_item_id LEFT JOIN fushati_users u ON u.id=s.actor_id
       WHERE m.cafeteria_id=? AND s.created_at>=? ${menuId ? 'AND s.menu_item_id=?' : ''} ORDER BY s.created_at DESC,s.rowid DESC LIMIT 500`,
    ).bind(...(menuId ? [cafe.id, since, menuId.data] : [cafe.id, since])).all<{id: string; menu_item_id: string; item: string; delta: number; reason: string; kind: string; note: string; unit_cost_minor: number | null; created_at: string; actor: string}>()).results;
    return response({cafeteriaId: cafe.id, days, movements: rows.map((row) => ({id: row.id, menuId: row.menu_item_id, item: row.item, delta: row.delta, type: row.kind || row.reason, note: row.note, unitCostMinor: row.unit_cost_minor, at: row.created_at, actor: row.actor}))});
  } catch {
    return fail('server', 'تعذر تحميل المخزون. أعد المحاولة.', 500);
  }
}

export async function POST(req: Request) {
  const access = await current();
  if (!access) return fail('login', 'يرجى تسجيل الدخول', 401);
  if (!trustedBrowserOrigin(req, env.KHOTWA_PUBLIC_ORIGINS) || !req.headers.get('content-type')?.startsWith('application/json')) return fail('origin', 'طلب غير مسموح', 403);
  if (!isStaff(access.role)) return fail('forbidden', 'غير مسموح', 403);
  try {
    const raw = await req.text();
    if (raw.length > 4000) return fail('size', 'الطلب أكبر من المسموح', 413);
    const {op, data} = bodyModel.parse(JSON.parse(raw));
    if (await mustChange(access)) return fail('password', 'غيّر كلمة المرور المؤقتة أولاً', 403);

    // An item is found by id, then checked against its own cafeteria. Unknown and not-yours answer the same.
    const itemFor = async (menuId: string) => {
      const item = await db().prepare('SELECT id,cafeteria_id FROM fushati_menu_items WHERE id=?').bind(menuId).first<{id: string; cafeteria_id: string}>();
      return item && (await permittedCafeteria(access, item.cafeteria_id, false, 'inventory_manage')) ? item : null;
    };

    if (op === 'setup') {
      const v = z.object({menuId: id, tracked: z.boolean(), threshold: z.number().int().min(0).max(MAX_UNITS), cost: z.union([z.string(), z.number()]).optional()}).parse(data);
      const cost = v.cost === undefined || v.cost === '' ? null : moneyMinor(v.cost);
      if (v.cost !== undefined && v.cost !== '' && (cost === null || cost > 1_000_000)) return fail('cost', 'سعر التكلفة غير صحيح', 400);
      if (!(await itemFor(v.menuId))) return fail('forbidden', 'المنتج غير متاح', 403);
      await setupStock(v.menuId, v.tracked, v.threshold, cost, now());
      await audit(access.userId, 'stock-setup', 'menu', v.menuId, `${v.tracked ? 'tracked' : 'untracked'} threshold=${v.threshold}`);
      return response({ok: true});
    }

    if (op === 'move') {
      const v = z.object({
        menuId: id,
        kind: z.enum(STOCK_KINDS),
        quantity: z.number().int().min(0).max(MAX_UNITS),
        note: z.string().trim().max(200).default(''),
        cost: z.union([z.string(), z.number()]).optional(),
        requestId: id,
      }).parse(data);
      if (v.kind !== 'stocktake' && v.quantity < 1) return fail('quantity', 'الكمية يجب أن تكون 1 أو أكثر', 400);
      const cost = v.cost === undefined || v.cost === '' ? null : moneyMinor(v.cost);
      if (v.cost !== undefined && v.cost !== '' && (cost === null || cost > 1_000_000)) return fail('cost', 'سعر التكلفة غير صحيح', 400);
      if (cost !== null && v.kind !== 'receipt') return fail('cost', 'سعر التكلفة يُسجل مع الاستلام فقط', 400);
      if (!(await itemFor(v.menuId))) return fail('forbidden', 'المنتج غير متاح', 403);
      const result = await moveStock({menuId: v.menuId, kind: v.kind as StockKind, quantity: v.quantity, note: v.note, unitCostMinor: cost, requestId: v.requestId, actorId: access.userId, stamp: now()});
      if (!result.ok) {
        if (result.code === 'untracked') return fail('untracked', 'فعّل تتبع المخزون لهذا المنتج أولاً', 409, {onHand: result.onHand});
        if (result.code === 'insufficient') return fail('insufficient', 'الكمية المتوفرة أقل من المطلوب', 409, {onHand: result.onHand});
        return fail('forbidden', 'المنتج غير متاح', 403);
      }
      if (!result.duplicate) await audit(access.userId, 'stock-' + v.kind, 'menu', v.menuId, String(result.delta));
      return response({ok: true, duplicate: result.duplicate, onHand: result.onHand, delta: result.delta});
    }

    if (op === 'scan') {
      const v = z.object({
        cafeteriaId: id,
        barcode: z.string().max(80),
        quantity: z.number().int().min(0).max(MAX_UNITS),
        cost: z.union([z.string(), z.number()]).optional(),
        requestId: id,
        product: z.object({name: z.string().trim().min(2).max(140), category: z.string().trim().min(1).max(70), price: z.union([z.string(), z.number()]).optional()}).optional(),
      }).parse(data);
      const code = normalizeBarcode(v.barcode);
      const problem = barcodeProblem(code);
      if (problem) return fail('barcode', barcodeMessage(problem, 'ar'), 400, {problem});
      const cost = v.cost === undefined || v.cost === '' ? null : moneyMinor(v.cost);
      if (v.cost !== undefined && v.cost !== '' && (cost === null || cost > 1_000_000)) return fail('cost', 'سعر التكلفة غير صحيح', 400);
      const [menuManage, menuPropose, stockManage] = await Promise.all(
        (['menu_manage', 'menu_propose', 'inventory_manage'] as const).map((permission) => permittedCafeteria(access, v.cafeteriaId, false, permission)),
      );
      const cafe = menuManage || menuPropose || stockManage;
      if (!cafe) return fail('forbidden', 'المقصف غير متاح', 403);

      let item = await db().prepare('SELECT id,name,active FROM fushati_menu_items WHERE cafeteria_id=? AND barcode=?').bind(cafe.id, code).first<{id: string; name: string; active: number}>();
      let created = false;
      let pending = false;
      if (!item) {
        if (!v.product) return fail('unknown_barcode', 'هذا الباركود غير مسجل بعد. أدخل اسم المنتج لإضافته.', 404);
        if (!menuManage && !menuPropose) return fail('forbidden', 'ليس لديك صلاحية إضافة منتجات', 403);
        // Same rule as adding a product by hand: a manager sets the price and the product is on sale when it has one;
        // a staff member only proposes, with no price, and a manager approves it later.
        const price = menuManage ? moneyMinor(v.product.price ?? '0') : 0;
        if (price === null || price > 1_000_000) return fail('price', 'السعر غير صحيح', 400);
        pending = !(menuManage && price > 0);
        const newId = crypto.randomUUID();
        try {
          await db().prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at,barcode) VALUES(?,?,?,?,?,?,?,?,?,?)')
            .bind(newId, cafe.id, v.product.name, v.product.category, price, pending ? 0 : 1, 1, access.userId, now(), code).run();
        } catch (error) {
          if (/UNIQUE/i.test(String((error as Error)?.message))) return fail('barcode_taken', 'هذا الباركود سُجّل للتو لمنتج آخر. امسحه مرة أخرى.', 409);
          throw error;
        }
        item = {id: newId, name: v.product.name, active: pending ? 0 : 1};
        created = true;
        await audit(access.userId, 'create-menu', 'menu', newId, 'barcode');
      }

      let onHand: number | null = null;
      let received = 0;
      let duplicate = false;
      if (v.quantity > 0) {
        if (!stockManage) {
          // The product may have just been added; the stock is not this person's to change.
          return fail('stock_forbidden', created ? 'أُضيف المنتج، لكن ليس لديك صلاحية إدارة المخزون لإضافة الكمية.' : 'ليس لديك صلاحية إدارة المخزون', 403, {created, id: item.id, name: item.name, pending});
        }
        const inventory = await db().prepare('SELECT tracked,low_stock_threshold FROM fushati_inventory WHERE menu_item_id=?').bind(item.id).first<{tracked: number; low_stock_threshold: number}>();
        if (!inventory?.tracked) await setupStock(item.id, true, inventory?.low_stock_threshold ?? 5, cost, now());
        const result = await moveStock({menuId: item.id, kind: 'receipt', quantity: v.quantity, note: 'barcode', unitCostMinor: cost, requestId: v.requestId, actorId: access.userId, stamp: now()});
        if (!result.ok) return fail('stock', 'تعذر تسجيل الكمية. أعد المحاولة.', 409, {created, id: item.id, name: item.name});
        onHand = result.onHand;
        received = result.delta;
        duplicate = result.duplicate;
        if (!result.duplicate) await audit(access.userId, 'stock-receipt', 'menu', item.id, String(result.delta));
      }
      return response({ok: true, created, pending, id: item.id, name: item.name, received, onHand, duplicate});
    }

    return fail('unknown', 'عملية غير متاحة', 400);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return fail('input', 'بيانات غير صحيحة', 400);
    return fail('server', 'تعذر حفظ المخزون. أعد المحاولة.', 500);
  }
}
