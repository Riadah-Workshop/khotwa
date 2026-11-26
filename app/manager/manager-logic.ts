// Pure helpers for the school manager dashboard: labels, chart geometry and the CSV export.
// No imports, so scripts/test-manager-report.mjs can load this file on its own.

export type Slice = {name: string; value: number};
export type TrendPoint = {month: string; value: number};
export type ManagerReport = {
  schoolName: string;
  schoolCode: string;
  students: number;
  openFollowups: number;
  grades: Slice[];
  attendance: Slice[];
  categories: Slice[];
  trend: TrendPoint[];
  from: string;
  to: string;
};
export type StatusTone = 'green' | 'amber' | 'red' | 'slate';

const ATTENDANCE: Record<string, {ar: string; en: string; tone: StatusTone}> = {
  present: {ar: 'حاضر', en: 'Present', tone: 'green'},
  late: {ar: 'حضر متأخرًا', en: 'Late', tone: 'amber'},
  absent: {ar: 'غائب', en: 'Absent', tone: 'red'},
};

/** The database stores present / late / absent; people should read a word in their own language. */
export function attendanceName(status: string, en: boolean): string {
  const known = ATTENDANCE[status];
  return known ? (en ? known.en : known.ar) : status;
}

export function attendanceTone(status: string): StatusTone {
  return ATTENDANCE[status]?.tone || 'slate';
}

export function sumValues(items: Slice[]): number {
  return items.reduce((total, item) => total + (Number.isFinite(item.value) ? item.value : 0), 0);
}

export type BarRow = {name: string; value: number; share: number; width: number};

/** Largest first; width is relative to the largest row, share is the percentage of the whole. */
export function rankedBars(items: Slice[]): BarRow[] {
  const rows = items.filter(item => item.value > 0).sort((a, b) => b.value - a.value);
  const max = rows[0]?.value || 0;
  const total = sumValues(rows);
  return rows.map(row => ({
    name: row.name,
    value: row.value,
    share: total ? Math.round((row.value / total) * 100) : 0,
    width: max ? Math.max(2, Math.round((row.value / max) * 100)) : 0,
  }));
}

export type ColumnRow = {month: string; value: number; height: number};

/** Every month from the start date's month to the end date's month, as "YYYY-MM" (at most 14, a year plus the edges). */
export function monthsBetween(from: string, to: string): string[] {
  const start = /^(\d{4})-(\d{2})/.exec(from);
  const end = /^(\d{4})-(\d{2})/.exec(to);
  if (!start || !end) return [];
  let year = Number(start[1]);
  let month = Number(start[2]);
  const endYear = Number(end[1]);
  const endMonth = Number(end[2]);
  const months: string[] = [];
  while ((year < endYear || (year === endYear && month <= endMonth)) && months.length < 14) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

/**
 * Columns for the monthly trend. The database only returns months that have cases, so with a period given every month of
 * it is drawn, a quiet month as an empty column: a missing month must not look like the line simply continuing.
 * Heights are a percentage of the tallest column (a column with data is never invisible).
 */
export function trendColumns(points: TrendPoint[], range?: {from: string; to: string}): ColumnRow[] {
  const byMonth = new Map(points.map(point => [point.month, point.value]));
  // Array.from, not a spread: the test loader compiles to ES5, where spreading a Set gives an empty list.
  const months = Array.from(new Set((range ? monthsBetween(range.from, range.to) : []).concat(points.map(point => point.month)))).sort();
  const max = months.reduce((top, month) => Math.max(top, byMonth.get(month) || 0), 0);
  return months.map(month => {
    const value = byMonth.get(month) || 0;
    return {month, value, height: max && value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0};
  });
}

/** "2026-11" → "Nov 26" / «نوفمبر ٢٦». Anything that is not a year-month is shown as it came. */
export function monthLabel(month: string, en: boolean): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  try {
    return new Intl.DateTimeFormat(en ? 'en-GB' : 'ar-u-ca-gregory-nu-latn', {month: 'short', year: '2-digit', timeZone: 'UTC'}).format(date);
  } catch {
    return month;
  }
}

/** Money is stored in halalas; the screen shows riyals with two decimals. */
export function formatMoney(minor: number): string {
  return new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format((Number.isFinite(minor) ? minor : 0) / 100);
}

/**
 * One CSV cell. A text that starts with = + - @ (or a tab / carriage return) would be run as a formula by Excel,
 * so it is prefixed with an apostrophe; numbers are written as they are.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_LABELS = {
  school: {ar: 'المدرسة', en: 'School'},
  from: {ar: 'من تاريخ', en: 'From'},
  to: {ar: 'إلى تاريخ', en: 'To'},
  students: {ar: 'الطلاب النشطون', en: 'Active students'},
  followups: {ar: 'حالات قيد المتابعة', en: 'Open follow-ups'},
  section: {ar: 'القسم', en: 'Section'},
  label: {ar: 'البند', en: 'Label'},
  count: {ar: 'العدد', en: 'Count'},
  grades: {ar: 'الطلاب حسب الصف', en: 'Grades'},
  attendance: {ar: 'الحضور والغياب', en: 'Attendance'},
  caseType: {ar: 'الحالات حسب النوع', en: 'Case type'},
  monthly: {ar: 'الحالات شهريًا', en: 'Monthly cases'},
};

export function buildReportCsv(data: ManagerReport, en: boolean): string {
  const l = (key: keyof typeof CSV_LABELS) => (en ? CSV_LABELS[key].en : CSV_LABELS[key].ar);
  const rows: unknown[][] = [
    [l('school'), data.schoolName],
    [l('from'), data.from],
    [l('to'), data.to],
    [l('students'), data.students],
    [l('followups'), data.openFollowups],
    [],
    [l('section'), l('label'), l('count')],
    ...data.grades.map(x => [l('grades'), x.name, x.value]),
    ...data.attendance.map(x => [l('attendance'), attendanceName(x.name, en), x.value]),
    ...data.categories.map(x => [l('caseType'), x.name, x.value]),
    ...data.trend.map(x => [l('monthly'), x.month, x.value]),
  ];
  return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function reportFileName(data: Pick<ManagerReport, 'from' | 'to'>): string {
  return `khotwa-manager-report-${data.from}-${data.to}.csv`;
}
