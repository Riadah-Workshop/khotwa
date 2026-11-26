'use client';
import {useEffect, useState} from 'react';
import {Check, ChartColumn, Download, FileSpreadsheet, Printer, Receipt, RefreshCw, Users, Wallet, Warehouse, X} from 'lucide-react';
import type {ReactNode} from 'react';
import '../ui/kx.css';
import './panels.css';
import {Badge, Card, Chip, Empty, Notice, Stat, cx} from '../ui/kx';
import {GROUPS, formatCell, groupReports, headline, isNumeric, rangeProblem, reportUrl, reportsFor} from './report-ui';
import type {CatalogCafeteria, CatalogReport, ReportRun} from './report-ui';

type CatalogState = {reports: CatalogReport[]; cafeterias: CatalogCafeteria[]; from: string; to: string; today: string};
type RunState = {key: string; run: ReportRun | null; error: string};

const GROUP_ICON: Record<string, ReactNode> = {sales: <Receipt size={18}/>, money: <Wallet size={18}/>, stock: <Warehouse size={18}/>, staff: <Users size={18}/>};

export default function ReportsPanel({language, selectedCafeteriaId}: {language: 'ar' | 'en'; selectedCafeteriaId: string}) {
  const en = language === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [scope, setScope] = useState(selectedCafeteriaId || 'all');
  const [reportId, setReportId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<RunState | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/fushati/reports?op=catalog', {cache: 'no-store'})
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Request failed'); return body as CatalogState; })
      .then(body => {
        if (!live) return;
        setCatalog(body);
        setFrom(previous => previous || body.from);
        setTo(previous => previous || body.to);
      })
      .catch(e => { if (live) setCatalogError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  // A cafeteria the person cannot open reports for (or "all" with a single cafeteria) falls back to one that works.
  const known = catalog ? catalog.cafeterias : [];
  const scopeNow = scope === 'all' ? (known.length === 1 ? known[0].id : 'all') : known.some(c => c.id === scope) ? scope : known.length === 1 ? known[0].id : 'all';
  const offered = catalog ? reportsFor(catalog.reports, catalog.cafeterias, scopeNow) : [];
  const chosen = offered.find(report => report.id === reportId) || offered[0] || null;
  const problem = from && to ? rangeProblem(from, to) : null;
  const runKey = chosen ? `${chosen.id}|${scopeNow}|${from}|${to}|${reload}` : '';
  const loading = !!chosen && !problem && (!result || result.key !== runKey);

  useEffect(() => {
    if (!chosen || problem || !from || !to) return;
    let live = true;
    fetch(reportUrl(chosen.id, scopeNow, from, to), {cache: 'no-store'})
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Request failed'); return body as ReportRun; })
      .then(body => { if (live) setResult({key: runKey, run: body, error: ''}); })
      .catch(e => { if (live) setResult({key: runKey, run: null, error: e instanceof Error ? e.message : String(e)}); });
    return () => { live = false; };
  }, [chosen, problem, from, to, scopeNow, runKey]);

  if (catalogError) return <Notice tone="red" icon={<X size={18}/>} role="alert">{catalogError}</Notice>;
  if (!catalog) return <Card tone="blue" icon={<ChartColumn size={18}/>} title={t('التقارير', 'Reports')} tourId="cfa-reports"><Empty icon={<RefreshCw size={24}/>}>{t('جارٍ تحميل التقارير…', 'Loading the reports…')}</Empty></Card>;
  if (catalog.cafeterias.length === 0) return <Card tone="blue" icon={<ChartColumn size={18}/>} title={t('التقارير', 'Reports')} tourId="cfa-reports"><Empty icon={<ChartColumn size={24}/>}>{t('لا توجد تقارير متاحة لك. اطلب من مدير النظام صلاحية «التقارير».', 'No reports are available to you. Ask the system administrator for the "Reports" permission.')}</Empty></Card>;

  const groups = groupReports(offered);
  const run = result && result.key === runKey ? result.run : null;
  const head = run ? headline(run) : null;
  const cafeteriaLabel = scopeNow === 'all' ? t('كل مقاصفي', 'All my cafeterias') : catalog.cafeterias.find(c => c.id === scopeNow)?.label || '';

  return <div className="kx-grid" data-tour="cfa-reports">
    <Card tone="blue" icon={<ChartColumn size={18}/>} title={t('اختر التقرير', 'Choose a report')} description={t('كل التقارير أرقام مجمّعة؛ لا تُعرض فيها أسماء الطلاب أو أولياء الأمور.', 'Every report is totals only; no student or parent is named.')} tourId="cfa-report-picker">
      <div className="kx-form-grid">
        <label className="kx-field">{t('المقصف', 'Cafeteria')}
          <select className="kx-select" value={scopeNow} onChange={e => { setScope(e.target.value); setReportId(''); }}>
            {catalog.cafeterias.length > 1 && <option value="all">{t('كل مقاصفي', 'All my cafeterias')}</option>}
            {catalog.cafeterias.map(c => <option key={c.id} value={c.id}>{c.label}{c.active ? '' : t(' (موقوف)', ' (disabled)')}</option>)}
          </select>
        </label>
        <div className="cfr-dates">
          <label className="kx-field">{t('من تاريخ', 'From')}<input className="kx-input" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} disabled={!!chosen && !chosen.dated}/></label>
          <label className="kx-field">{t('إلى تاريخ', 'To')}<input className="kx-input" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} disabled={!!chosen && !chosen.dated}/></label>
        </div>
      </div>
      {problem && <Notice tone="amber" icon={<X size={18}/>} role="alert">{problem === 'long' ? t('الفترة أطول من سنة. اختر فترة أقصر.', 'The period is longer than a year. Pick a shorter one.') : problem === 'order' ? t('تاريخ البداية بعد تاريخ النهاية.', 'The start date is after the end date.') : t('تاريخ غير صحيح.', 'That is not a valid date.')}</Notice>}
      {groups.map(({group, reports}) => <div key={group.id} className="cfr-group" data-tone={group.tone}>
        <h3><Chip icon={GROUP_ICON[group.id]} tone={group.tone} size="small"/>{group.label[language]} <small>{group.description[language]}</small></h3>
        <div className="cfr-picks" role="group" aria-label={group.label[language]}>
          {reports.map(report => <button key={report.id} type="button" className={cx('cfr-pick', chosen?.id === report.id && 'is-on')} aria-pressed={chosen?.id === report.id} onClick={() => setReportId(report.id)}>
            <strong>{report.title[language]}</strong><small>{report.description[language]}</small>
          </button>)}
        </div>
      </div>)}
    </Card>

    {chosen && <Card tone={GROUPS.find(g => g.id === chosen.group)?.tone || 'blue'} icon={<FileSpreadsheet size={18}/>} title={chosen.title[language]} description={`${chosen.description[language]} — ${cafeteriaLabel}${chosen.dated && !problem ? ` · ${from} → ${to}` : ''}`} tourId="cfa-report-result"
      actions={<div className="kx-btn-row cfr-actions">
        <a className={cx('kx-btn is-small', run && 'is-solid')} aria-disabled={!run} href={run && !problem ? reportUrl(chosen.id, scopeNow, from, to, {format: 'csv', lang: language}) : undefined} download><Download size={16}/><span className="kx-btn-text">{t('تنزيل CSV', 'Download CSV')}</span></a>
        <button type="button" className="kx-btn is-small" onClick={() => window.print()} disabled={!run}><Printer size={16}/><span className="kx-btn-text">{t('طباعة / PDF', 'Print / PDF')}</span></button>
        <button type="button" className="kx-btn is-small" onClick={() => setReload(n => n + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'kx-spin' : undefined}/><span className="kx-btn-text">{t('تحديث', 'Refresh')}</span></button>
      </div>}>
      {loading && <Empty icon={<RefreshCw size={24}/>}>{t('جارٍ إنشاء التقرير…', 'Building the report…')}</Empty>}
      {result && result.key === runKey && result.error && <Notice tone="red" icon={<X size={18}/>} role="alert">{result.error}</Notice>}
      {run && <>
        {head && <div className="kx-grid cols-3 keep-2"><Stat icon={<Check size={22}/>} tone={GROUPS.find(g => g.id === chosen.group)?.tone || 'blue'} label={t(`الإجمالي: ${head.column.label.ar}`, `Total: ${head.column.label.en}`)} value={formatCell(head.value, head.column, en)}/>
          <Stat icon={<FileSpreadsheet size={22}/>} tone="slate" label={t('عدد الصفوف', 'Rows')} value={run.rows.length}/></div>}
        {run.truncated && <Notice tone="amber" icon={<X size={18}/>}>{t('التقرير كبير؛ عُرضت أول ٥٠٠٠ صف. ضيّق الفترة أو اختر مقصفاً واحداً.', 'The report is large; the first 5,000 rows are shown. Narrow the period or pick one cafeteria.')}</Notice>}
        {run.rows.length === 0
          ? <Empty icon={<FileSpreadsheet size={24}/>}>{t('لا توجد بيانات في هذه الفترة.', 'No data in this period.')}</Empty>
          : <div className="kx-table-wrap"><table className="kx-table cfr-table">
            <thead><tr>{run.columns.map(column => <th key={column.key} scope="col" className={isNumeric(column) ? 'is-num' : undefined}>{column.label[language]}</th>)}</tr></thead>
            <tbody>{run.rows.map((row, index) => <tr key={index}>{run.columns.map(column => <td key={column.key} className={isNumeric(column) ? 'is-num' : undefined}>{column.type === 'enum' && row[column.key] !== null ? <Badge tone={row[column.key] === 'low' ? 'amber' : row[column.key] === 'out' ? 'red' : row[column.key] === 'ok' ? 'green' : 'slate'}>{formatCell(row[column.key], column, en)}</Badge> : formatCell(row[column.key], column, en)}</td>)}</tr>)}</tbody>
            {run.totals && <tfoot><tr>{run.columns.map((column, index) => <td key={column.key} className={isNumeric(column) ? 'is-num' : undefined}>{index === 0 ? t('الإجمالي', 'Total') : column.key in (run.totals as Record<string, unknown>) ? formatCell((run.totals as Record<string, string | number | null>)[column.key], column, en) : ''}</td>)}</tr></tfoot>}
          </table></div>}
        <p className="cfr-foot">{t('المبالغ بالريال السعودي. أُنشئ في', 'Amounts are in Saudi riyals (SAR). Generated')} {new Date(run.generatedAt).toLocaleString(en ? 'en-GB' : 'ar-u-ca-gregory-nu-latn', {dateStyle: 'medium', timeStyle: 'short'})}</p>
      </>}
    </Card>}
  </div>;
}
