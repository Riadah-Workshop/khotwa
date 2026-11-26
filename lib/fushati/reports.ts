import {db} from './core';
import type {FushatiPermission} from './permissions';

// Cafeteria reports. Every report is an aggregate: counts, quantities and money per day, item, category, agent or
// cafeteria. No report lists a student, a parent or an agent's position.
//
// To open a report you need the "reports" permission in the cafeteria AND the permission for the kind of data
// in it (sales, balances, stock, attendance), so an administrator can let a supervisor see stock reports and not sales.
//
// Money is returned in halalas (integers); the screens and the CSV convert it.

export type Text = {ar: string; en: string};
export type ColumnType = 'text' | 'int' | 'money' | 'percent' | 'minutes' | 'datetime' | 'enum';
export type Column = {key: string; type: ColumnType; label: Text; values?: Record<string, Text>};
export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;
export type ReportGroup = 'sales' | 'money' | 'stock' | 'staff';

export type ReportContext = {
  /** Cafeterias the report covers. All of them passed the permission check already. */
  ids: string;
  /** Saudi days, inclusive. */
  from: string;
  to: string;
  /** The same window as UTC timestamps, for tables that keep timestamps. */
  fromIso: string;
  untilIso: string;
};

type ReportDefinition = {
  id: string;
  group: ReportGroup;
  needs: FushatiPermission;
  /** A snapshot of today (balances, stock) ignores the dates. */
  dated: boolean;
  title: Text;
  description: Text;
  columns: Column[];
  /** Columns that are added up in the total row. */
  sums: string[];
  run: (ctx: ReportContext) => Promise<ReportRow[]>;
  /** Fills columns that are worked out from others (averages, shares). Runs on every row and on the total row. */
  derive?: (row: ReportRow, total: ReportRow) => void;
};

const t = (ar: string, en: string): Text => ({ar, en});
const IN_CAFES = 'IN (SELECT value FROM json_each(?))';
const STATUS: Record<string, Text> = {ok: t('متوفر', 'In stock'), low: t('منخفض', 'Low'), out: t('نفد', 'Out of stock'), untracked: t('غير متتبع', 'Not tracked')};
const WASTE_KIND: Record<string, Text> = {waste: t('هدر', 'Waste'), damage: t('تلف', 'Damaged'), expired: t('منتهي الصلاحية', 'Expired')};
const num = (value: unknown) => Number(value ?? 0) || 0;
const rowsOf = async <T,>(sql: string, ...params: unknown[]) => (await db().prepare(sql).bind(...params).all<T>()).results;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const cafeteriaColumn: Column = {key: 'cafeteria', type: 'text', label: t('المقصف', 'Cafeteria')};

const stockStatus = (tracked: number, onHand: number, threshold: number) => (!tracked ? 'untracked' : onHand <= 0 ? 'out' : onHand <= threshold ? 'low' : 'ok');

const LINES_FROM = `FROM fushati_purchases p, json_each(p.items_json) it`;
const QTY = `CAST(json_extract(it.value,'$.quantity') AS INTEGER)`;
const LINE = `CAST(json_extract(it.value,'$.lineTotalMinor') AS INTEGER)`;

export const REPORTS: ReportDefinition[] = [
  {
    id: 'sales-daily', group: 'sales', needs: 'sales_view', dated: true,
    title: t('المبيعات اليومية', 'Daily sales'), description: t('عدد العمليات والقطع وإجمالي المبيعات لكل يوم.', 'Orders, items and total sales for each day.'),
    columns: [{key: 'day', type: 'text', label: t('اليوم', 'Day')}, {key: 'orders', type: 'int', label: t('العمليات', 'Orders')}, {key: 'items', type: 'int', label: t('القطع', 'Items')}, {key: 'total', type: 'money', label: t('الإجمالي', 'Total')}, {key: 'average', type: 'money', label: t('متوسط العملية', 'Average order')}],
    sums: ['orders', 'items', 'total'],
    run: async (c) => (await rowsOf<{cid: string; day: string; orders: number; items: number; total: number}>(
      `SELECT p.cafeteria_id cid,p.day_key day,COUNT(*) orders,COALESCE(SUM((SELECT SUM(CAST(json_extract(j.value,'$.quantity') AS INTEGER)) FROM json_each(p.items_json) j)),0) items,SUM(p.total_minor) total
       FROM fushati_purchases p WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,p.day_key ORDER BY p.day_key,p.cafeteria_id`, c.ids, c.from, c.to)
    ).map((r) => ({cid: r.cid, day: r.day, orders: num(r.orders), items: num(r.items), total: num(r.total), average: 0})),
    derive: (row) => { row.average = num(row.orders) ? Math.round(num(row.total) / num(row.orders)) : 0; },
  },
  {
    id: 'sales-hourly', group: 'sales', needs: 'sales_view', dated: true,
    title: t('المبيعات حسب الساعة', 'Sales by hour'), description: t('أوقات الذروة خلال اليوم (بتوقيت الرياض).', 'Peak times of the day (Riyadh time).'),
    columns: [{key: 'hour', type: 'text', label: t('الساعة', 'Hour')}, {key: 'orders', type: 'int', label: t('العمليات', 'Orders')}, {key: 'total', type: 'money', label: t('الإجمالي', 'Total')}, {key: 'share', type: 'percent', label: t('النسبة', 'Share')}],
    sums: ['orders', 'total'],
    run: async (c) => (await rowsOf<{cid: string; hour: number; orders: number; total: number}>(
      `SELECT p.cafeteria_id cid,(CAST(substr(p.created_at,12,2) AS INTEGER)+3)%24 hour,COUNT(*) orders,SUM(p.total_minor) total
       FROM fushati_purchases p WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,hour ORDER BY hour,p.cafeteria_id`, c.ids, c.from, c.to)
    ).map((r) => ({cid: r.cid, hour: `${String(num(r.hour)).padStart(2, '0')}:00`, orders: num(r.orders), total: num(r.total), share: 0})),
    derive: (row, total) => { row.share = share(num(row.total), num(total.total)); },
  },
  {
    id: 'sales-by-item', group: 'sales', needs: 'sales_view', dated: true,
    title: t('المبيعات حسب المنتج', 'Sales by item'), description: t('الأكثر مبيعاً والأقل مبيعاً مع الكمية والإيراد.', 'Best and worst sellers with quantity and revenue.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'category', type: 'text', label: t('الفئة', 'Category')}, {key: 'quantity', type: 'int', label: t('الكمية', 'Quantity')}, {key: 'revenue', type: 'money', label: t('الإيراد', 'Revenue')}, {key: 'share', type: 'percent', label: t('النسبة', 'Share')}],
    sums: ['quantity', 'revenue'],
    run: async (c) => (await rowsOf<{cid: string; name: string; category: string; qty: number; revenue: number}>(
      `SELECT p.cafeteria_id cid,json_extract(it.value,'$.name') name,COALESCE(m.category,'') category,SUM(${QTY}) qty,SUM(${LINE}) revenue
       ${LINES_FROM} LEFT JOIN fushati_menu_items m ON m.id=json_extract(it.value,'$.id')
       WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,json_extract(it.value,'$.id') ORDER BY revenue DESC LIMIT 5000`, c.ids, c.from, c.to)
    ).map((r) => ({cid: r.cid, item: r.name ?? '', category: r.category, quantity: num(r.qty), revenue: num(r.revenue), share: 0})),
    derive: (row, total) => { row.share = share(num(row.revenue), num(total.revenue)); },
  },
  {
    id: 'sales-by-category', group: 'sales', needs: 'sales_view', dated: true,
    title: t('المبيعات حسب الفئة', 'Sales by category'), description: t('توزيع المبيعات على فئات القائمة.', 'How sales split across menu categories.'),
    columns: [{key: 'category', type: 'text', label: t('الفئة', 'Category')}, {key: 'quantity', type: 'int', label: t('الكمية', 'Quantity')}, {key: 'revenue', type: 'money', label: t('الإيراد', 'Revenue')}, {key: 'share', type: 'percent', label: t('النسبة', 'Share')}],
    sums: ['quantity', 'revenue'],
    run: async (c) => (await rowsOf<{cid: string; category: string; qty: number; revenue: number}>(
      `SELECT p.cafeteria_id cid,COALESCE(m.category,'') category,SUM(${QTY}) qty,SUM(${LINE}) revenue
       ${LINES_FROM} LEFT JOIN fushati_menu_items m ON m.id=json_extract(it.value,'$.id')
       WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,COALESCE(m.category,'') ORDER BY revenue DESC`, c.ids, c.from, c.to)
    ).map((r) => ({cid: r.cid, category: r.category, quantity: num(r.qty), revenue: num(r.revenue), share: 0})),
    derive: (row, total) => { row.share = share(num(row.revenue), num(total.revenue)); },
  },
  {
    id: 'sales-by-agent', group: 'sales', needs: 'sales_view', dated: true,
    title: t('المبيعات حسب الموظف', 'Sales by agent'), description: t('عدد العمليات وإجمالي ما باعه كل موظف.', 'Orders and total sold by each agent.'),
    columns: [{key: 'agent', type: 'text', label: t('الموظف', 'Agent')}, {key: 'orders', type: 'int', label: t('العمليات', 'Orders')}, {key: 'total', type: 'money', label: t('الإجمالي', 'Total')}, {key: 'share', type: 'percent', label: t('النسبة', 'Share')}],
    sums: ['orders', 'total'],
    run: async (c) => (await rowsOf<{cid: string; name: string; orders: number; total: number}>(
      `SELECT p.cafeteria_id cid,COALESCE(u.full_name,'') name,COUNT(*) orders,SUM(p.total_minor) total
       FROM fushati_purchases p LEFT JOIN fushati_users u ON u.id=p.agent_id
       WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,p.agent_id ORDER BY total DESC`, c.ids, c.from, c.to)
    ).map((r) => ({cid: r.cid, agent: r.name, orders: num(r.orders), total: num(r.total), share: 0})),
    derive: (row, total) => { row.share = share(num(row.total), num(total.total)); },
  },
  {
    id: 'margin', group: 'sales', needs: 'sales_view', dated: true,
    title: t('هامش الربح التقديري', 'Estimated margin'), description: t('الإيراد ناقص التكلفة، بحسب سعر التكلفة الحالي المسجل للمنتج. المنتجات بلا تكلفة لا يُحسب لها هامش.', 'Revenue minus cost, using the cost price currently recorded for each item. Items without a cost price have no margin.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'quantity', type: 'int', label: t('الكمية', 'Quantity')}, {key: 'revenue', type: 'money', label: t('الإيراد', 'Revenue')}, {key: 'cost', type: 'money', label: t('التكلفة التقديرية', 'Estimated cost')}, {key: 'margin', type: 'money', label: t('الهامش', 'Margin')}, {key: 'marginPct', type: 'percent', label: t('نسبة الهامش', 'Margin %')}],
    sums: ['quantity', 'revenue', 'cost', 'margin', 'costedRevenue'],
    run: async (c) => (await rowsOf<{cid: string; name: string; qty: number; revenue: number; unit: number}>(
      `SELECT p.cafeteria_id cid,json_extract(it.value,'$.name') name,SUM(${QTY}) qty,SUM(${LINE}) revenue,COALESCE(MAX(inv.cost_minor),0) unit
       ${LINES_FROM} LEFT JOIN fushati_inventory inv ON inv.menu_item_id=json_extract(it.value,'$.id')
       WHERE p.posted=1 AND p.cafeteria_id ${IN_CAFES} AND p.day_key BETWEEN ? AND ? GROUP BY p.cafeteria_id,json_extract(it.value,'$.id') ORDER BY revenue DESC LIMIT 5000`, c.ids, c.from, c.to)
    ).map((r) => {
      // An item with no cost price has no margin: it is left out of cost and margin, not counted as free.
      const known = num(r.unit) > 0;
      // costedRevenue is the revenue of items whose cost is known: the margin percentage is worked out against it (not shown).
      return {cid: r.cid, item: r.name ?? '', quantity: num(r.qty), revenue: num(r.revenue), cost: known ? num(r.qty) * num(r.unit) : null, margin: known ? num(r.revenue) - num(r.qty) * num(r.unit) : null, marginPct: null, costedRevenue: known ? num(r.revenue) : 0};
    }),
    derive: (row) => { row.marginPct = row.margin !== null && num(row.costedRevenue) > 0 ? share(num(row.margin), num(row.costedRevenue)) : null; },
  },
  {
    id: 'topups', group: 'money', needs: 'balances_view', dated: true,
    title: t('الشحن بالتحويل البنكي', 'Bank top-ups'), description: t('تحويلات أولياء الأمور المقدمة: المقبولة والمرفوضة والمعلقة، حسب يوم التقديم. دون أسماء.', 'Parents\' submitted bank transfers: approved, rejected and pending, by day submitted. No names.'),
    columns: [{key: 'day', type: 'text', label: t('اليوم', 'Day')}, {key: 'submitted', type: 'int', label: t('المقدمة', 'Submitted')}, {key: 'approved', type: 'int', label: t('المقبولة', 'Approved')}, {key: 'rejected', type: 'int', label: t('المرفوضة', 'Rejected')}, {key: 'pending', type: 'int', label: t('المعلقة', 'Pending')}, {key: 'approvedTotal', type: 'money', label: t('مبلغ المقبول', 'Approved amount')}],
    sums: ['submitted', 'approved', 'rejected', 'pending', 'approvedTotal'],
    run: async (c) => (await rowsOf<{cid: string; day: string; submitted: number; approved: number; rejected: number; pending: number; total: number}>(
      `SELECT t.cafeteria_id cid,date(t.created_at,'+3 hours') day,COUNT(*) submitted,SUM(t.status='approved') approved,SUM(t.status='rejected') rejected,SUM(t.status='pending') pending,COALESCE(SUM(CASE WHEN t.status='approved' THEN t.amount_minor END),0) total
       FROM fushati_transfers t WHERE t.cafeteria_id ${IN_CAFES} AND t.created_at>=? AND t.created_at<? GROUP BY t.cafeteria_id,day ORDER BY day,t.cafeteria_id`, c.ids, c.fromIso, c.untilIso)
    ).map((r) => ({cid: r.cid, day: r.day, submitted: num(r.submitted), approved: num(r.approved), rejected: num(r.rejected), pending: num(r.pending), approvedTotal: num(r.total)})),
  },
  {
    id: 'balances', group: 'money', needs: 'balances_view', dated: false,
    title: t('ملخص أرصدة الطلاب', 'Student balances summary'), description: t('إجمالي الأرصدة وعدد الحسابات اليوم. أرقام مجمّعة دون أسماء.', 'Total balances and number of accounts today. Totals only, no names.'),
    columns: [{key: 'accounts', type: 'int', label: t('الحسابات', 'Accounts')}, {key: 'active', type: 'int', label: t('النشطة', 'Active')}, {key: 'funded', type: 'int', label: t('بها رصيد', 'With balance')}, {key: 'empty', type: 'int', label: t('رصيدها صفر', 'Empty')}, {key: 'total', type: 'money', label: t('إجمالي الأرصدة', 'Total balances')}, {key: 'average', type: 'money', label: t('متوسط الحساب', 'Average account')}],
    sums: ['accounts', 'active', 'funded', 'empty', 'total'],
    run: async (c) => (await rowsOf<{cid: string; accounts: number; active: number; funded: number; empty: number; total: number}>(
      `SELECT a.cafeteria_id cid,COUNT(*) accounts,SUM(a.active) active,SUM(a.balance_minor>0) funded,SUM(a.balance_minor=0) empty,COALESCE(SUM(a.balance_minor),0) total
       FROM fushati_accounts a WHERE a.cafeteria_id ${IN_CAFES} GROUP BY a.cafeteria_id`, c.ids)
    ).map((r) => ({cid: r.cid, accounts: num(r.accounts), active: num(r.active), funded: num(r.funded), empty: num(r.empty), total: num(r.total), average: 0})),
    derive: (row) => { row.average = num(row.accounts) ? Math.round(num(row.total) / num(row.accounts)) : 0; },
  },
  {
    id: 'stock-levels', group: 'stock', needs: 'inventory_view', dated: false,
    title: t('المخزون الحالي', 'Current stock'), description: t('الكمية المتوفرة لكل منتج وقيمتها بسعر التكلفة.', 'Quantity on hand for each item and its value at cost price.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'category', type: 'text', label: t('الفئة', 'Category')}, {key: 'onHand', type: 'int', label: t('المتوفر', 'On hand')}, {key: 'threshold', type: 'int', label: t('حد التنبيه', 'Warning level')}, {key: 'status', type: 'enum', label: t('الحالة', 'Status'), values: STATUS}, {key: 'value', type: 'money', label: t('القيمة بالتكلفة', 'Value at cost')}],
    sums: ['value'],
    run: async (c) => (await rowsOf<{cid: string; name: string; category: string; tracked: number; on_hand: number; th: number; cost: number}>(
      `SELECT m.cafeteria_id cid,m.name,m.category,inv.tracked,inv.on_hand,inv.low_stock_threshold th,inv.cost_minor cost
       FROM fushati_menu_items m JOIN fushati_inventory inv ON inv.menu_item_id=m.id WHERE m.cafeteria_id ${IN_CAFES} ORDER BY m.cafeteria_id,m.category,m.name LIMIT 5000`, c.ids)
    ).map((r) => ({cid: r.cid, item: r.name, category: r.category, onHand: r.tracked ? num(r.on_hand) : null, threshold: r.tracked ? num(r.th) : null, status: stockStatus(r.tracked, num(r.on_hand), num(r.th)), value: r.tracked ? num(r.on_hand) * num(r.cost) : 0})),
  },
  {
    id: 'low-stock', group: 'stock', needs: 'inventory_view', dated: false,
    title: t('منتجات تحتاج توريد', 'Items to reorder'), description: t('المنتجات المتتبعة التي وصلت إلى حد التنبيه أو نفدت.', 'Tracked items at or below their warning level, or out of stock.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'category', type: 'text', label: t('الفئة', 'Category')}, {key: 'onHand', type: 'int', label: t('المتوفر', 'On hand')}, {key: 'threshold', type: 'int', label: t('حد التنبيه', 'Warning level')}, {key: 'status', type: 'enum', label: t('الحالة', 'Status'), values: STATUS}, {key: 'sold30', type: 'int', label: t('المباع آخر 30 يوماً', 'Sold, last 30 days')}],
    sums: [],
    run: async (c) => (await rowsOf<{cid: string; name: string; category: string; on_hand: number; th: number; sold: number}>(
      `SELECT m.cafeteria_id cid,m.name,m.category,inv.on_hand,inv.low_stock_threshold th,
        COALESCE((SELECT -SUM(s.delta) FROM fushati_stock_movements s WHERE s.menu_item_id=m.id AND s.reason='purchase' AND s.created_at>=?),0) sold
       FROM fushati_menu_items m JOIN fushati_inventory inv ON inv.menu_item_id=m.id
       WHERE m.cafeteria_id ${IN_CAFES} AND inv.tracked=1 AND inv.on_hand<=inv.low_stock_threshold ORDER BY inv.on_hand,m.name LIMIT 5000`, new Date(Date.now() - 30 * 86_400_000).toISOString(), c.ids)
    ).map((r) => ({cid: r.cid, item: r.name, category: r.category, onHand: num(r.on_hand), threshold: num(r.th), status: stockStatus(1, num(r.on_hand), num(r.th)), sold30: num(r.sold)})),
  },
  {
    id: 'stock-movements', group: 'stock', needs: 'inventory_view', dated: true,
    title: t('حركة المخزون', 'Stock movement'), description: t('لكل منتج: المستلم والمباع والتالف والتسويات خلال الفترة.', 'For each item: received, sold, written off and adjustments in the period.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'received', type: 'int', label: t('المستلم', 'Received')}, {key: 'sold', type: 'int', label: t('المباع', 'Sold')}, {key: 'wasted', type: 'int', label: t('الهدر والتلف', 'Written off')}, {key: 'adjusted', type: 'int', label: t('تسويات الجرد', 'Count adjustments')}, {key: 'net', type: 'int', label: t('الصافي', 'Net')}],
    sums: ['received', 'sold', 'wasted', 'adjusted', 'net'],
    run: async (c) => (await rowsOf<{cid: string; name: string; received: number; sold: number; wasted: number; adjusted: number; net: number}>(
      `SELECT m.cafeteria_id cid,m.name,
        SUM(CASE WHEN s.reason IN ('opening','receipt') OR s.kind='return' THEN s.delta ELSE 0 END) received,
        -SUM(CASE WHEN s.reason='purchase' THEN s.delta ELSE 0 END) sold,
        -SUM(CASE WHEN s.kind IN ('waste','damage','expired') THEN s.delta ELSE 0 END) wasted,
        SUM(CASE WHEN s.reason='correction' AND s.kind IN ('','stocktake') THEN s.delta ELSE 0 END) adjusted,
        SUM(s.delta) net
       FROM fushati_stock_movements s JOIN fushati_menu_items m ON m.id=s.menu_item_id
       WHERE m.cafeteria_id ${IN_CAFES} AND s.created_at>=? AND s.created_at<? GROUP BY m.id ORDER BY m.name LIMIT 5000`, c.ids, c.fromIso, c.untilIso)
    ).map((r) => ({cid: r.cid, item: r.name, received: num(r.received), sold: num(r.sold), wasted: num(r.wasted), adjusted: num(r.adjusted), net: num(r.net)})),
  },
  {
    id: 'waste', group: 'stock', needs: 'inventory_view', dated: true,
    title: t('الهدر والتالف', 'Waste and write-offs'), description: t('الكميات المشطوبة وقيمتها بسعر التكلفة وقت الشطب.', 'Quantities written off and their value at the cost price on the day.'),
    columns: [{key: 'item', type: 'text', label: t('المنتج', 'Item')}, {key: 'reason', type: 'enum', label: t('السبب', 'Reason'), values: WASTE_KIND}, {key: 'quantity', type: 'int', label: t('الكمية', 'Quantity')}, {key: 'value', type: 'money', label: t('القيمة', 'Value')}],
    sums: ['quantity', 'value'],
    run: async (c) => (await rowsOf<{cid: string; name: string; kind: string; qty: number; value: number}>(
      `SELECT m.cafeteria_id cid,m.name,s.kind,SUM(-s.delta) qty,SUM(-s.delta*COALESCE(s.unit_cost_minor,0)) value
       FROM fushati_stock_movements s JOIN fushati_menu_items m ON m.id=s.menu_item_id
       WHERE m.cafeteria_id ${IN_CAFES} AND s.kind IN ('waste','damage','expired') AND s.created_at>=? AND s.created_at<? GROUP BY m.id,s.kind ORDER BY value DESC,qty DESC LIMIT 5000`, c.ids, c.fromIso, c.untilIso)
    ).map((r) => ({cid: r.cid, item: r.name, reason: r.kind, quantity: num(r.qty), value: num(r.value)})),
  },
  {
    id: 'agent-attendance', group: 'staff', needs: 'presence_view', dated: true,
    title: t('حضور الموظفين', 'Agent attendance'), description: t('عدد الأيام والزيارات ومدة التواجد لكل موظف. دون مواقع.', 'Days, visits and time on site for each agent. No positions.'),
    columns: [{key: 'agent', type: 'text', label: t('الموظف', 'Agent')}, {key: 'days', type: 'int', label: t('الأيام', 'Days')}, {key: 'stays', type: 'int', label: t('الزيارات', 'Visits')}, {key: 'minutes', type: 'minutes', label: t('مدة التواجد', 'Time on site')}, {key: 'first', type: 'datetime', label: t('أول وصول', 'First arrival')}, {key: 'last', type: 'datetime', label: t('آخر مغادرة', 'Last departure')}],
    sums: ['stays', 'minutes'],
    run: async (c) => (await rowsOf<{cid: string; name: string; days: number; stays: number; minutes: number; first: string; last: string}>(
      `SELECT v.cafeteria_id cid,COALESCE(u.full_name,'') name,COUNT(DISTINCT v.day_key) days,COUNT(*) stays,
        SUM(CAST(ROUND((julianday(COALESCE(v.left_at,v.last_seen_at))-julianday(v.arrived_at))*1440) AS INTEGER)) minutes,MIN(v.arrived_at) first,MAX(COALESCE(v.left_at,v.last_seen_at)) last
       FROM fushati_visits v LEFT JOIN fushati_users u ON u.id=v.user_id
       WHERE v.cafeteria_id ${IN_CAFES} AND v.arrived_at>=? AND v.arrived_at<? GROUP BY v.cafeteria_id,v.user_id ORDER BY minutes DESC LIMIT 5000`, c.ids, c.fromIso, c.untilIso)
    ).map((r) => ({cid: r.cid, agent: r.name, days: num(r.days), stays: num(r.stays), minutes: Math.max(0, num(r.minutes)), first: r.first, last: r.last})),
  },
];

export const REPORT_IDS = REPORTS.map((report) => report.id);
export const reportById = (id: string) => REPORTS.find((report) => report.id === id) ?? null;

/** What the screens need to list the reports: no queries, no SQL. */
export function reportCatalog() {
  return REPORTS.map(({id, group, needs, dated, title, description, columns}) => ({id, group, needs, dated, title, description, columns}));
}

export type ReportResult = {
  id: string;
  from: string;
  to: string;
  dated: boolean;
  multi: boolean;
  columns: Column[];
  rows: ReportRow[];
  totals: ReportRow | null;
  truncated: boolean;
};

export const MAX_REPORT_DAYS = 366;
export const DEFAULT_REPORT_DAYS = 30;
const DAY_MS = 86_400_000;

export const isRealDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dayPlus = (value: string, days: number) => new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** A Saudi day window as UTC timestamps. Saudi Arabia has no daylight saving: always UTC+3. */
export function saudiWindow(from: string, to: string) {
  return {fromIso: new Date(`${from}T00:00:00+03:00`).toISOString(), untilIso: new Date(`${dayPlus(to, 1)}T00:00:00+03:00`).toISOString()};
}

export function defaultRange(today: string) {
  return {from: dayPlus(today, -(DEFAULT_REPORT_DAYS - 1)), to: today};
}

export function rangeProblem(from: string, to: string): string | null {
  if (!isRealDay(from) || !isRealDay(to)) return 'date';
  if (from > to) return 'order';
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS >= MAX_REPORT_DAYS) return 'long';
  return null;
}

/** Runs one report for the cafeterias already checked by the caller. `labels` maps cafeteria id to its display name. */
export async function runReport(report: ReportDefinition, cafeteriaIds: string[], labels: Map<string, string>, from: string, to: string): Promise<ReportResult> {
  const window = saudiWindow(from, to);
  const found = await report.run({ids: JSON.stringify(cafeteriaIds), from, to, ...window});
  const multi = cafeteriaIds.length > 1;
  const rows: ReportRow[] = found.map((row) => {
    const {cid, ...rest} = row as ReportRow & {cid: string};
    return {...(multi ? {cafeteria: labels.get(String(cid)) ?? ''} : {}), ...rest};
  });
  const totals: ReportRow = {};
  for (const key of report.sums) totals[key] = rows.reduce((sum, row) => sum + num(row[key]), 0);
  if (report.derive) { for (const row of rows) report.derive(row, totals); report.derive(totals, totals); }
  return {
    id: report.id, from, to, dated: report.dated, multi,
    columns: multi ? [cafeteriaColumn, ...report.columns] : report.columns,
    rows, totals: report.sums.length ? totals : null, truncated: found.length >= 5000,
  };
}

/** A cell as text for a spreadsheet. Text that a spreadsheet would run as a formula is made harmless. */
export function csvCell(value: Cell, column: Column, lang: 'ar' | 'en'): string {
  if (value === null || value === undefined) return '';
  if (column.type === 'money') return (num(value) / 100).toFixed(2);
  if (column.type === 'percent') return num(value).toFixed(1);
  if (column.type === 'int' || column.type === 'minutes') return String(num(value));
  if (column.type === 'datetime') return new Date(Date.parse(String(value)) + 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
  const text = column.type === 'enum' ? column.values?.[String(value)]?.[lang] ?? String(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(result: ReportResult, lang: 'ar' | 'en'): string {
  const lines = [result.columns.map((column) => csvCell(column.label[lang], {key: '', type: 'text', label: column.label}, lang)).join(',')];
  for (const row of result.rows) lines.push(result.columns.map((column) => csvCell(row[column.key] ?? null, column, lang)).join(','));
  if (result.totals) lines.push(result.columns.map((column, index) => (index === 0 ? csvCell(lang === 'ar' ? 'الإجمالي' : 'Total', {key: '', type: 'text', label: column.label}, lang) : column.key in result.totals! ? csvCell(result.totals![column.key], column, lang) : '')).join(','));
  return '﻿' + lines.join('\r\n');
}
