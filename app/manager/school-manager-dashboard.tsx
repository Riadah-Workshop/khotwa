'use client';
import {useCallback, useEffect, useState} from 'react';
import {CalendarDays, ChartColumn, ClipboardList, Download, Eye, GraduationCap, LayoutGrid, Languages, LogOut, Printer, RefreshCw, ShoppingBasket, TrendingUp, TriangleAlert, X} from 'lucide-react';
import '../ui/kx.css';
import './manager.css';
import {Badge, Card, Empty, Meter, Notice, PageHead, Stat, TabPanel, Tabs} from '../ui/kx';
import {GuidedTour, TourHelpButton, useTour} from '../ui/tour';
import {attendanceName, attendanceTone, buildReportCsv, formatMoney, monthLabel, rankedBars, reportFileName, sumValues, trendColumns} from './manager-logic';
import type {ManagerReport, Slice} from './manager-logic';

type Section = 'overview' | 'trends' | 'cafeteria';
type CafeteriaSummary = {name: string; purchases: number; sales_minor: number};
type LoadState = {key: string; data: ManagerReport | null; error: string};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function RankedBars({items, en}: {items: Slice[]; en: boolean}) {
  const rows = rankedBars(items);
  if (!rows.length) return null;
  return <ol className="mgr-bars">
    {rows.map(row => <li key={row.name}>
      <span className="mgr-bar-name">{row.name}</span>
      <span className="mgr-bar-track" aria-hidden="true"><i style={{inlineSize: `${row.width}%`}}/></span>
      <b className="mgr-bar-value">{row.value}</b>
      <span className="mgr-bar-share"><bdi dir="ltr">{row.share}%</bdi><span className="kx-sr"> {en ? 'of the total' : 'من الإجمالي'}</span></span>
    </li>)}
  </ol>;
}

export default function ManagerDashboard({tourKey}: {tourKey?: string}) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => today());
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({key: '', data: null, error: ''});
  const [cafeterias, setCafeterias] = useState<CafeteriaSummary[] | 'error' | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [printAll, setPrintAll] = useState(false);

  const en = lang === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const key = `${from}|${to}|${reload}`;
  const busy = state.key !== key;
  const data = state.data;
  const tour = useTour('manager', tourKey, !!data);

  useEffect(() => {
    try { setLang(localStorage.getItem('khotwa:manager-language') === 'en' ? 'en' : 'ar'); } catch { /* storage blocked: keep Arabic */ }
  }, []);
  function changeLanguage(value: 'ar' | 'en') {
    setLang(value);
    try { localStorage.setItem('khotwa:manager-language', value); } catch { /* the choice lasts until reload */ }
  }

  useEffect(() => {
    let live = true;
    fetch('/api/manager/overview?' + new URLSearchParams({from, to}), {cache: 'no-store'})
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Unable to load report');
        return body as ManagerReport;
      })
      .then(body => { if (live) setState({key, data: body, error: ''}); })
      .catch(e => { if (live) setState(previous => ({key, data: previous.data, error: e instanceof Error ? e.message : String(e)})); });
    return () => { live = false; };
  }, [from, to, key]);

  useEffect(() => {
    let live = true;
    fetch('/api/fushati?op=manager-summary', {cache: 'no-store'})
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('summary'))))
      .then(value => { if (live) setCafeterias(Array.isArray(value.cafeterias) ? value.cafeterias : []); })
      .catch(() => { if (live) setCafeterias('error'); });
    return () => { live = false; };
  }, []);

  // Printing shows every tab, so the paper report is complete; the screen goes back afterwards.
  useEffect(() => {
    if (!printAll) return;
    const timer = window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrintAll(false), 1000);
    }, 350);
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); };
  }, [printAll]);

  const openSection = useCallback((value: string) => {
    if (value === 'overview' || value === 'trends' || value === 'cafeteria') setSection(value);
  }, []);

  function downloadCsv() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([buildReportCsv(data, en)], {type: 'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFileName(data);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const attendanceTotal = data ? sumValues(data.attendance) : 0;
  const casesTotal = data ? sumValues(data.categories) : 0;
  const presentCount = data ? data.attendance.filter(x => x.name === 'present' || x.name === 'late').reduce((n, x) => n + x.value, 0) : 0;
  const columns = data ? trendColumns(data.trend, {from: data.from, to: data.to}) : [];
  const trendEmpty = columns.every(column => column.value === 0);
  const showing = (id: Section) => section === id || printAll;

  return <div className="kx-scope" data-accent="blue" dir={en ? 'ltr' : 'rtl'} lang={lang}>
    <header className="kx-topbar">
      <div className="kx-brand"><span className="kx-brand-mark"><ChartColumn size={26}/></span><div><strong>{t('خطوة • مساحة مدير المدرسة', 'Khotwa • School Manager')}</strong><small>{data?.schoolName || t('تقارير ولوحات المتابعة', 'Reports and dashboards')}</small></div></div>
      <div className="kx-topbar-actions" data-tour="mgr-tools">
        <button type="button" className="kx-btn" onClick={() => changeLanguage(en ? 'ar' : 'en')} aria-label={en ? 'العربية' : 'English'}><Languages size={18}/><span className="kx-btn-text">{en ? 'العربية' : 'English'}</span></button>
        <TourHelpButton language={lang} onClick={tour.start}/>
        <a className="kx-btn" href="/logout" aria-label={t('تسجيل الخروج', 'Sign out')}><LogOut size={18}/><span className="kx-btn-text">{t('تسجيل الخروج', 'Sign out')}</span></a>
      </div>
    </header>

    <main className="kx-page">
      <PageHead icon={<ChartColumn size={26}/>} tone="blue" title={data?.schoolName || t('لوحة مدير المدرسة', 'School Manager Dashboard')}
        description={t('أرقام المدرسة في مكان واحد: الحضور والحالات والطلاب ومقصف فسحتي. للاطلاع والتقارير فقط، ولا يمكن تعديل أي سجل من هنا.', 'The school at a glance: attendance, cases, students and the Fushati cafeteria. For viewing and reports only — nothing can be edited from here.')}
        actions={<div className="kx-btn-row" data-tour="mgr-export">
          <Badge tone="slate" icon={<Eye size={14}/>}>{t('عرض فقط', 'View only')}</Badge>
          <button type="button" className="kx-btn" onClick={downloadCsv} disabled={!data}><Download size={18}/><span className="kx-btn-text">{t('تصدير CSV', 'Export CSV')}</span></button>
          <button type="button" className="kx-btn" onClick={() => setPrintAll(true)} disabled={!data || printAll}><Printer size={18}/><span className="kx-btn-text">{t('طباعة / PDF', 'Print / PDF')}</span></button>
        </div>}/>

      <div className="mgr-print-only"><strong>{data?.schoolName}</strong> · {data?.from} → {data?.to}</div>

      <Card tone="blue" icon={<CalendarDays size={18}/>} title={t('الفترة الزمنية', 'Reporting period')} description={t('تنطبق على الحضور والحالات والاتجاه. عدد الطلاب والمتابعات المفتوحة يعرضان الوضع الحالي.', 'Applies to attendance, cases and the trend. Student numbers and open follow-ups always show today.')} tourId="mgr-period"
        actions={<button type="button" className="kx-btn is-solid" onClick={() => setReload(n => n + 1)} disabled={busy}><RefreshCw size={18} className={busy ? 'kx-spin' : undefined}/><span className="kx-btn-text">{busy ? t('جارٍ التحديث…', 'Loading…') : t('تحديث البيانات', 'Refresh')}</span></button>}>
        <div className="kx-form-grid">
          <label className="kx-field">{t('من تاريخ', 'From')}<input className="kx-input" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
          <label className="kx-field">{t('إلى تاريخ', 'To')}<input className="kx-input" type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
        </div>
      </Card>

      {state.error && <Notice tone="red" icon={<X size={18}/>} role="alert">{state.error}</Notice>}
      {!data && busy && <Empty icon={<RefreshCw size={24}/>}>{t('جارٍ تحميل التقرير…', 'Loading the report…')}</Empty>}

      {data && <>
        <Tabs idPrefix="mgr" label={t('أقسام التقرير', 'Report sections')} value={section} onChange={id => setSection(id as Section)} rtl={!en} tourId="mgr-sections" items={[
          {id: 'overview', label: t('نظرة عامة', 'Overview'), icon: <LayoutGrid size={18}/>, tone: 'blue'},
          {id: 'trends', label: t('الطلاب والاتجاه', 'Students & trend'), icon: <GraduationCap size={18}/>, tone: 'teal'},
          {id: 'cafeteria', label: t('مقصف فسحتي', 'Fushati cafeteria'), icon: <ShoppingBasket size={18}/>, tone: 'amber'},
        ]}/>

        <TabPanel idPrefix="mgr" id="overview" active={showing('overview')}>
          <div className="kx-grid cols-4 keep-2" data-tour="mgr-stats">
            <Stat icon={<GraduationCap size={22}/>} tone="blue" label={t('الطلاب النشطون', 'Active students')} value={data.students} hint={t('الوضع الحالي', 'Today')}/>
            <Stat icon={<CalendarDays size={22}/>} tone="green" label={t('الحضور والغياب المسجل', 'Attendance entries')} value={attendanceTotal} hint={t('في الفترة', 'In the period')}/>
            <Stat icon={<ClipboardList size={22}/>} tone="amber" label={t('الحالات في الفترة', 'Cases in period')} value={casesTotal}/>
            <Stat icon={<TriangleAlert size={22}/>} tone={data.openFollowups ? 'red' : 'slate'} label={t('حالات قيد المتابعة', 'Open follow-ups')} value={data.openFollowups} hint={data.openFollowups ? t('تحتاج متابعة', 'Waiting for follow-up') : t('لا شيء معلّق', 'Nothing pending')}/>
          </div>
          <div className="kx-grid cols-2 mgr-top">
            <Card tone="green" icon={<CalendarDays size={18}/>} title={t('توزيع الحضور والغياب', 'Attendance distribution')} description={t('كيف توزعت سجلات الحضور في الفترة.', 'How the attendance entries were split in the period.')} tourId="mgr-attendance">
              {data.attendance.length === 0
                ? <Empty icon={<CalendarDays size={24}/>}>{t('لا توجد بيانات حضور ضمن هذه الفترة.', 'No attendance data in this period.')}</Empty>
                : <>
                  <Meter label={t('توزيع الحضور والغياب', 'Attendance distribution')} segments={data.attendance.map(x => ({tone: attendanceTone(x.name), value: x.value, label: attendanceName(x.name, en)}))}/>
                  {presentCount > 0 && <p className="mgr-note">{t('نسبة الحضور (حاضر أو متأخر): ', 'Attendance rate (present or late): ')}<bdi dir="ltr">{Math.round((presentCount / attendanceTotal) * 100)}%</bdi></p>}
                </>}
            </Card>
            <Card tone="amber" icon={<ClipboardList size={18}/>} title={t('الحالات حسب النوع', 'Cases by type')} description={t('الأكثر تسجيلاً أولاً.', 'The most frequent first.')} tourId="mgr-cases">
              {data.categories.length === 0
                ? <Empty icon={<ClipboardList size={24}/>}>{t('لا توجد حالات ضمن هذه الفترة.', 'No cases in this period.')}</Empty>
                : <RankedBars items={data.categories} en={en}/>}
            </Card>
          </div>
        </TabPanel>

        <TabPanel idPrefix="mgr" id="trends" active={showing('trends')}>
          <div className="kx-grid cols-2 mgr-top">
            <Card tone="teal" icon={<GraduationCap size={18}/>} title={t('توزيع الطلاب على الصفوف', 'Students by grade')} description={t('عدد الطلاب النشطين في كل صف.', 'Active students in each grade.')} tourId="mgr-grades">
              {data.grades.length === 0
                ? <Empty icon={<GraduationCap size={24}/>}>{t('لا يوجد طلاب نشطون.', 'There are no active students.')}</Empty>
                : <RankedBars items={data.grades} en={en}/>}
            </Card>
            <Card tone="violet" icon={<TrendingUp size={18}/>} title={t('اتجاه الحالات شهريًا', 'Monthly case trend')} description={t('عدد الحالات المسجلة في كل شهر من الفترة.', 'Cases recorded in each month of the period.')} tourId="mgr-trend">
              {trendEmpty && <Empty icon={<TrendingUp size={24}/>}>{t('لا توجد حالات ضمن هذه الفترة.', 'No cases in this period.')}</Empty>}
              {!trendEmpty && columns.length === 1 && <Stat icon={<TrendingUp size={22}/>} tone="violet" label={t(`الحالات في ${monthLabel(columns[0].month, false)}`, `Cases in ${monthLabel(columns[0].month, true)}`)} value={columns[0].value} hint={t('اختر فترة أطول لرؤية الاتجاه', 'Pick a longer period to see the trend')}/>}
              {!trendEmpty && columns.length > 1 && <ul className="mgr-columns" aria-label={t('الحالات شهريًا', 'Cases per month')}>
                {columns.map(column => <li key={column.month}>
                  <span className="mgr-col-plot"><span className="mgr-col-bar" style={{blockSize: `${column.height}%`}}><b>{column.value}</b></span></span>
                  <span className="mgr-col-label">{monthLabel(column.month, en)}</span>
                </li>)}
              </ul>}
            </Card>
          </div>
        </TabPanel>

        <TabPanel idPrefix="mgr" id="cafeteria" active={showing('cafeteria')}>
          <Card tone="amber" icon={<ShoppingBasket size={18}/>} title={t('فسحتي — ملخص مقاصف المدرسة', 'Fushati — school cafeteria summary')} description={t('عدد العمليات وإجمالي المبيعات لكل مقصف مرتبط بمدرستك.', 'Number of purchases and total sales for each cafeteria linked to your school.')} tourId="mgr-cafeteria">
            {cafeterias === null && <Empty icon={<RefreshCw size={24}/>}>{t('جارٍ تحميل ملخص المقصف…', 'Loading the cafeteria summary…')}</Empty>}
            {cafeterias === 'error' && <Notice tone="amber" icon={<TriangleAlert size={18}/>} role="alert">{t('تعذر تحميل ملخص المقصف الآن. حدّث الصفحة بعد قليل.', 'The cafeteria summary could not be loaded. Refresh the page in a moment.')}</Notice>}
            {Array.isArray(cafeterias) && cafeterias.length === 0 && <Empty icon={<ShoppingBasket size={24}/>}>{t('لا يوجد مقصف مرتبط بهذه المدرسة حالياً.', 'No cafeteria is linked to this school yet.')}</Empty>}
            {Array.isArray(cafeterias) && cafeterias.length > 0 && <div className="kx-grid cols-3">
              {cafeterias.map(c => <Stat key={c.name} icon={<ShoppingBasket size={22}/>} tone="amber" label={c.name} value={<>{formatMoney(c.sales_minor)} <small>{t('ر.س', 'SAR')}</small></>} hint={t(`العمليات: ${c.purchases}`, `Purchases: ${c.purchases}`)}/>)}
            </div>}
          </Card>
        </TabPanel>
      </>}

      <p className="mgr-footer">{t('جميع النتائج خاصة بالمدرسة الحالية فقط. الأرقام حسب الفترة المحددة ما عدا الطلاب النشطين والمتابعات المفتوحة.', 'All results are limited to this school. Date filters apply except to active students and open follow-ups.')}</p>
    </main>

    <GuidedTour platform="manager" accent="blue" open={tour.open} onClose={tour.close} language={lang} onSection={openSection}/>
  </div>;
}
