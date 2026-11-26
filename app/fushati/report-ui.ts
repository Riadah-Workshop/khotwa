// Pure helpers for the cafeteria reports screen: how a report cell is shown, which reports a cafeteria offers,
// the dates and the links. No imports, so scripts/test-cafeteria-ui.mjs can load this file on its own.

export type Text = {ar: string; en: string};
export type ColumnType = 'text' | 'int' | 'money' | 'percent' | 'minutes' | 'datetime' | 'enum';
export type Column = {key: string; type: ColumnType; label: Text; values?: Record<string, Text>};
export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;
export type ReportGroup = 'sales' | 'money' | 'stock' | 'staff';
export type CatalogReport = {id: string; group: ReportGroup; needs: string; dated: boolean; title: Text; description: Text; columns: Column[]};
export type CatalogCafeteria = {id: string; label: string; active: boolean; reports: string[]};
export type ReportRun = {
  id: string; from: string; to: string; dated: boolean; multi: boolean; columns: Column[]; rows: ReportRow[]; totals: ReportRow | null; truncated: boolean;
  title: Text; description: Text; cafeterias: {id: string; label: string}[]; generatedAt: string;
};

export const GROUPS: Array<{id: ReportGroup; label: Text; description: Text; tone: 'green' | 'amber' | 'teal' | 'violet'}> = [
  {id: 'sales', tone: 'green', label: {ar: 'المبيعات', en: 'Sales'}, description: {ar: 'ماذا بِيع ومتى ومن باع', en: 'What sold, when and by whom'}},
  {id: 'money', tone: 'amber', label: {ar: 'المال والأرصدة', en: 'Money & balances'}, description: {ar: 'الشحن والحوالات وأرصدة الطلاب', en: 'Top-ups, transfers and student balances'}},
  {id: 'stock', tone: 'teal', label: {ar: 'المخزون', en: 'Inventory'}, description: {ar: 'الكميات والهدر والحركة', en: 'Quantities, waste and movements'}},
  {id: 'staff', tone: 'violet', label: {ar: 'الموظفون', en: 'Staff'}, description: {ar: 'حضور العاملين في المقصف', en: 'Attendance of the cafeteria staff'}},
];

const num = (value: unknown) => Number(value ?? 0) || 0;

export function money(minor: number): string {
  return new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(num(minor) / 100);
}

/** 150 → "2 h 30 min" / «٢ س ٣٠ د» (Latin digits, as everywhere else on the screen). */
export function formatMinutes(total: number, en: boolean): string {
  const minutes = Math.max(0, Math.round(num(total)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return en ? `${m} min` : `${m} د`;
  return en ? (m ? `${h} h ${m} min` : `${h} h`) : (m ? `${h} س ${m} د` : `${h} س`);
}

/** Saudi time (UTC+3, no daylight saving) as "2026-11-26 14:05". */
export function saudiTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** One cell as text for the screen. Money is in riyals with separators; a missing value is a dash. */
export function formatCell(value: Cell | undefined, column: Column, en: boolean): string {
  if (value === null || value === undefined) return '—';
  switch (column.type) {
    case 'money': return money(num(value));
    case 'percent': return `${num(value).toFixed(1)}%`;
    case 'int': return String(num(value));
    case 'minutes': return formatMinutes(num(value), en);
    case 'datetime': return saudiTime(String(value));
    case 'enum': { const entry = column.values?.[String(value)]; return entry ? (en ? entry.en : entry.ar) : String(value); }
    default: return String(value);
  }
}

/** Number-like columns are right-aligned (left in Arabic) so digits line up. */
export const isNumeric = (column: Column) => column.type === 'int' || column.type === 'money' || column.type === 'percent' || column.type === 'minutes';

/** The reports a cafeteria offers, or for "all" every report at least one of the cafeterias offers. */
export function reportsFor(catalog: CatalogReport[], cafeterias: CatalogCafeteria[], cafeteriaId: string): CatalogReport[] {
  const allowed = new Set(cafeteriaId === 'all' ? cafeterias.flatMap(c => c.reports) : (cafeterias.find(c => c.id === cafeteriaId)?.reports || []));
  return catalog.filter(report => allowed.has(report.id));
}

export function groupReports(reports: CatalogReport[]): Array<{group: (typeof GROUPS)[number]; reports: CatalogReport[]}> {
  return GROUPS.map(group => ({group, reports: reports.filter(report => report.group === group.id)})).filter(entry => entry.reports.length > 0);
}

const isRealDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** The same rule the server applies (a real day, start not after end, under a year), so the screen says so before asking. */
export function rangeProblem(from: string, to: string): 'date' | 'order' | 'long' | null {
  if (!isRealDay(from) || !isRealDay(to)) return 'date';
  if (from > to) return 'order';
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 >= 366) return 'long';
  return null;
}

export function reportUrl(report: string, cafeteriaId: string, from: string, to: string, extra: {format?: 'csv'; lang?: 'ar' | 'en'} = {}): string {
  const query = new URLSearchParams({op: 'run', report, cafeteriaId, from, to});
  if (extra.format) query.set('format', extra.format);
  if (extra.lang) query.set('lang', extra.lang);
  return `/api/fushati/reports?${query.toString()}`;
}

/** The column that makes the best "headline" number for a report: the first money column of the total row, else the first count. */
export function headline(run: Pick<ReportRun, 'columns' | 'totals'>): {column: Column; value: number} | null {
  if (!run.totals) return null;
  const withTotal = run.columns.filter(column => column.key in (run.totals as ReportRow) && isNumeric(column));
  const pick = withTotal.find(column => column.type === 'money') || withTotal.find(column => column.type === 'int') || withTotal[0];
  return pick ? {column: pick, value: num((run.totals as ReportRow)[pick.key])} : null;
}
