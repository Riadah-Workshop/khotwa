'use client';
import {useCallback, useEffect, useState} from 'react';
import type {FormEvent} from 'react';
import {Building2, CalendarCheck2, CalendarDays, CalendarX2, Check, ClipboardList, Clock, GraduationCap, LayoutGrid, Languages, LockKeyhole, LogOut, RefreshCw, ShieldCheck, ShoppingBasket, Users, X} from 'lucide-react';
import '../ui/kx.css';
import './parent.css';
import FushatiParent, {CAFETERIA_VIEWS} from './fushati-parent';
import type {CafeteriaView} from './fushati-parent';
import {Badge, Card, Chip, Empty, Meter, Notice, PageHead, Stat, TabPanel, Tabs} from '../ui/kx';
import type {Tone} from '../ui/kx';
import {GuidedTour, TourHelpButton, useTour} from '../ui/tour';

type Attendance = {id: string; date: string; status: string};
type StudentCase = {id: string; type: string; date: string; followStatus: string; arrivalTime: string; exitTime: string};
type Student = {key: string; schoolId: string; schoolName: string; id: string; name: string; grade: string; classroom: string; attendance: Attendance[]; cases: StudentCase[]; attendanceCounts: Record<string, number>; caseCounts: Record<string, number>};
type Result = {students: Student[]; schoolCount: number; updatedAt: string};
type Section = 'overview' | 'attendance' | 'cases' | 'cafeteria';

const ATTENDANCE_TONE: Record<string, Tone> = {present: 'green', late: 'amber', absent: 'red', unmarked: 'slate'};
const AVATAR_TONES: Tone[] = ['green', 'teal', 'blue', 'violet', 'amber'];

export default function ParentPortal({tourKey}: {tourKey?: string}) {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [passwordPanel, setPasswordPanel] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [cafeteriaView, setCafeteriaView] = useState<CafeteriaView>('topup');
  const tour = useTour('parent', tourKey, !loading && !!result?.students.length);

  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const rtl = language === 'ar';
  const locale = language === 'en' ? 'en-GB' : 'ar-SA';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/parent/status', {credentials: 'same-origin', cache: 'no-store'});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || 'تعذر التحميل');
      setResult(v);
      setSelected(prev => (v.students.some((s: Student) => s.key === prev) ? prev : v.students[0]?.key || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الطلاب');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    try { setLanguage(localStorage.getItem('khotwa:parent-language') === 'en' ? 'en' : 'ar'); } catch { /* storage blocked: keep Arabic */ }
  }, [load]);

  function toggleLanguage() {
    const next = language === 'en' ? 'ar' : 'en';
    setLanguage(next);
    try { localStorage.setItem('khotwa:parent-language', next); } catch { /* storage blocked: the choice lasts until reload */ }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      const r = await fetch('/api/parent/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({oldPassword, newPassword})});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setNotice(t('تم تغيير كلمة المرور. سجل الدخول مجدداً.', 'Password updated. Please sign in again.'));
      setTimeout(() => { window.location.assign('/logout'); }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التغيير');
    }
  }

  // The tour opens the tab that holds the thing it is explaining.
  const openSection = useCallback((value: string) => {
    const [main, sub] = value.split(':');
    if (main === 'overview' || main === 'attendance' || main === 'cases' || main === 'cafeteria') setSection(main);
    if (sub && (CAFETERIA_VIEWS as string[]).includes(sub)) setCafeteriaView(sub as CafeteriaView);
  }, []);

  const child = result?.students.find(s => s.key === selected);
  const attendanceLabel: Record<string, string> = {present: t('حاضر', 'Present'), late: t('متأخر', 'Late'), absent: t('غائب', 'Absent'), unmarked: t('لم يسجّل', 'Not marked')};
  const followLabel: Record<string, string> = {open: t('قيد المتابعة', 'Open'), done: t('مكتملة', 'Done'), none: '—'};
  const attendanceIcon = (status: string) => (status === 'present' ? <Check size={13}/> : status === 'late' ? <Clock size={13}/> : status === 'absent' ? <X size={13}/> : null);
  const sortedAttendance = child ? [...child.attendance].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const sortedCases = child ? [...child.cases].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const openCases = sortedCases.filter(c => c.followStatus === 'open').length;
  const counts = child?.attendanceCounts || {};

  return <div className="kx-scope" data-accent="green" dir={rtl ? 'rtl' : 'ltr'} lang={language}>
    <header className="kx-topbar">
      <div className="kx-brand"><span className="kx-brand-mark"><GraduationCap size={26}/></span><div><strong>{t('خطوة | بوابة ولي الأمر', 'Khotwa | Parent Portal')}</strong><small>{t('جميع المدارس المرتبطة', 'All linked schools')}</small></div></div>
      <div className="kx-topbar-actions" data-tour="tools">
        <button type="button" className="kx-btn" onClick={toggleLanguage} aria-label={language === 'en' ? 'العربية' : 'English'}><Languages size={18}/><span className="kx-btn-text">{language === 'en' ? 'العربية' : 'English'}</span></button>
        <TourHelpButton language={language} onClick={tour.start}/>
        <button type="button" className="kx-btn" onClick={() => load()} disabled={loading} aria-label={t('تحديث', 'Refresh')}><RefreshCw size={18}/><span className="kx-btn-text">{t('تحديث', 'Refresh')}</span></button>
        <button type="button" className="kx-btn" onClick={() => setPasswordPanel(x => !x)} aria-label={t('كلمة المرور', 'Password')} aria-expanded={passwordPanel}><LockKeyhole size={18}/><span className="kx-btn-text">{t('كلمة المرور', 'Password')}</span></button>
        <a className="kx-btn" href="/logout" aria-label={t('خروج', 'Sign out')}><LogOut size={18}/><span className="kx-btn-text">{t('خروج', 'Sign out')}</span></a>
      </div>
    </header>

    <main className="kx-page">
      <PageHead icon={<Users size={26}/>} tone="green" title={t('متابعة حالة أبنائك', "Your children's school records")} description={t('اطلع على الحضور والغياب والتأخر والحالات المدرسية المسجلة. السجلات المدرسية للعرض فقط، ويمكنك إدارة مصروف الأبناء عبر فسحتي.', 'View attendance, absences, lateness and student cases. School records are read-only; manage spending through Fushati.')}/>
      {error && <Notice tone="red" icon={<X size={18}/>} role="alert">{error}</Notice>}
      {notice && <Notice tone="green" icon={<Check size={18}/>} role="status">{notice}</Notice>}

      {passwordPanel && <Card tone="amber" icon={<LockKeyhole size={18}/>} title={t('تغيير كلمة المرور', 'Change password')} description={t('بعد التغيير ستسجل الدخول من جديد.', 'You will be asked to sign in again afterwards.')}>
        <form className="kx-grid" onSubmit={changePassword}>
          <div className="kx-form-grid">
            <label className="kx-field">{t('كلمة المرور الحالية', 'Current password')}<input className="kx-input" type="password" required autoComplete="current-password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}/></label>
            <label className="kx-field">{t('كلمة المرور الجديدة (12 حرفاً على الأقل)', 'New password (at least 12 characters)')}<input className="kx-input" type="password" required minLength={12} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}/></label>
          </div>
          <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="amber"><Check size={18}/>{t('حفظ كلمة المرور', 'Save password')}</button></div>
        </form>
      </Card>}

      {loading && !result
        ? <div className="kx-grid" aria-busy="true" aria-label={t('جارٍ تحميل بيانات الأبناء…', 'Loading student information…')}><div className="parent-skeleton"/><div className="parent-skeleton"/></div>
        : !result?.students.length
          ? <Card tone="slate" icon={<ShieldCheck size={18}/>} title={t('لا توجد بيانات متاحة لهذا الحساب', 'No student records available for this account')}><Empty icon={<Users size={24}/>}>{t('راجع وكيل شؤون الطلاب لتفعيل أبناء حسابك.', 'Contact the Student Affairs Agent to link your children.')}</Empty></Card>
          : <>
            <div className="kx-grid">
              <h2 className="parent-section-label">{t(`أبنائي (${result.students.length})`, `My children (${result.students.length})`)}</h2>
              <div className="parent-children" data-tour="children">
                {result.students.map((s, index) => {
                  const latest = [...s.attendance].sort((a, b) => b.date.localeCompare(a.date))[0];
                  const tone = AVATAR_TONES[index % AVATAR_TONES.length];
                  return <button key={s.key} type="button" className="parent-child" data-tone={tone} aria-pressed={selected === s.key} onClick={() => setSelected(s.key)}>
                    <span className="parent-child-avatar" aria-hidden="true">{s.name.trim().charAt(0)}</span>
                    <span className="parent-child-body"><strong>{s.name}</strong><small><Building2 size={13} style={{verticalAlign: '-2px'}}/> {s.schoolName}</small><small>{s.grade} / {s.classroom}</small>
                      {latest && <span className="parent-child-meta"><Badge tone={ATTENDANCE_TONE[latest.status] || 'slate'} icon={attendanceIcon(latest.status)}>{attendanceLabel[latest.status] || latest.status}</Badge></span>}</span>
                  </button>;
                })}
              </div>
            </div>

            {child && <>
              <div className="parent-child-head"><Chip icon={<GraduationCap size={26}/>} tone="green" size="large"/><div><h2>{child.name}</h2><p>{child.schoolName} — {child.grade} / {child.classroom}</p></div></div>
              <Tabs idPrefix="portal" label={t('أقسام بيانات الابن', "Sections of the child's information")} value={section} onChange={id => setSection(id as Section)} rtl={rtl} tourId="sections" items={[
                {id: 'overview', label: t('نظرة عامة', 'Overview'), icon: <LayoutGrid size={18}/>, tone: 'green'},
                {id: 'attendance', label: t('الحضور والغياب', 'Attendance'), icon: <CalendarDays size={18}/>, tone: 'teal'},
                {id: 'cases', label: t('الحالات والمتابعة', 'Cases & follow-ups'), icon: <ClipboardList size={18}/>, tone: 'blue', badge: openCases},
                {id: 'cafeteria', label: t('المقصف (فسحتي)', 'Cafeteria (Fushati)'), icon: <ShoppingBasket size={18}/>, tone: 'amber'},
              ]}/>

              <TabPanel idPrefix="portal" id="overview" active={section === 'overview'}>
                <div className="kx-grid cols-4 keep-2" data-tour="overview-stats">
                  <Stat icon={<CalendarCheck2 size={22}/>} tone="green" label={t('أيام الحضور', 'Days present')} value={counts.present || 0}/>
                  <Stat icon={<Clock size={22}/>} tone="amber" label={t('أيام التأخر', 'Days late')} value={counts.late || 0}/>
                  <Stat icon={<CalendarX2 size={22}/>} tone="red" label={t('أيام الغياب', 'Days absent')} value={counts.absent || 0}/>
                  <Stat icon={<ClipboardList size={22}/>} tone="blue" label={t('الحالات المسجلة', 'Student cases')} value={child.cases.length} hint={openCases ? t(`${openCases} قيد المتابعة`, `${openCases} open`) : t('لا متابعة معلّقة', 'None pending')}/>
                </div>
                {openCases > 0 && <Notice tone="amber" icon={<ClipboardList size={18}/>} title={t(`${openCases} حالة قيد المتابعة`, `${openCases} case(s) being followed up`)}>
                  <button type="button" className="kx-btn is-small" data-tone="amber" onClick={() => setSection('cases')}>{t('عرض الحالات', 'View cases')}</button>
                </Notice>}
                <div className="kx-grid cols-2">
                  <Card tone="green" icon={<CalendarCheck2 size={18}/>} title={t('توزيع أيام الدراسة', 'School days breakdown')} description={t('الحضور والتأخر والغياب المسجّل.', 'Recorded present, late and absent days.')}>
                    <Meter label={t('توزيع الحضور', 'Attendance breakdown')} segments={[{tone: 'green', value: counts.present || 0, label: t('حاضر', 'Present')}, {tone: 'amber', value: counts.late || 0, label: t('متأخر', 'Late')}, {tone: 'red', value: counts.absent || 0, label: t('غائب', 'Absent')}]}/>
                  </Card>
                  <Card tone="teal" icon={<CalendarDays size={18}/>} title={t('آخر السجلات', 'Latest records')} description={t('آخر خمسة أيام مسجّلة.', 'The five most recent days.')} actions={<button type="button" className="kx-btn is-small" data-tone="teal" onClick={() => setSection('attendance')}>{t('الكل', 'All')}</button>}>
                    {sortedAttendance.length
                      ? <ul className="kx-list">{sortedAttendance.slice(0, 5).map(a => <li key={a.id}><span dir="ltr">{a.date}</span><Badge tone={ATTENDANCE_TONE[a.status] || 'slate'} icon={attendanceIcon(a.status)}>{attendanceLabel[a.status] || a.status}</Badge></li>)}</ul>
                      : <Empty icon={<CalendarDays size={24}/>}>{t('لا توجد سجلات حضور بعد', 'No attendance records yet')}</Empty>}
                  </Card>
                </div>
              </TabPanel>

              <TabPanel idPrefix="portal" id="attendance" active={section === 'attendance'}>
                <Card tourId="attendance-list" tone="teal" icon={<CalendarDays size={18}/>} title={t('سجل الحضور والغياب', 'Attendance history')} description={t('السجل للعرض فقط. للاستفسار تواصل مع المدرسة.', 'Read-only. Contact the school with any question.')}>
                  {sortedAttendance.length
                    ? <div className="kx-table-wrap"><table className="kx-table"><thead><tr><th>{t('التاريخ', 'Date')}</th><th>{t('الحالة', 'Status')}</th></tr></thead><tbody>{sortedAttendance.map(a => <tr key={a.id}><td dir="ltr">{a.date}</td><td><Badge tone={ATTENDANCE_TONE[a.status] || 'slate'} icon={attendanceIcon(a.status)}>{attendanceLabel[a.status] || a.status}</Badge></td></tr>)}</tbody></table></div>
                    : <Empty icon={<CalendarDays size={24}/>}>{t('لا توجد سجلات حضور بعد', 'No attendance records yet')}</Empty>}
                </Card>
              </TabPanel>

              <TabPanel idPrefix="portal" id="cases" active={section === 'cases'}>
                <Card tourId="cases-list" tone="blue" icon={<ShieldCheck size={18}/>} title={t('الحالات والمتابعة', 'Student cases and follow-ups')} description={t('الحالات المسجلة على الطالب وحالة متابعتها.', 'Cases recorded for the student and where their follow-up stands.')}>
                  {sortedCases.length
                    ? <div className="kx-table-wrap"><table className="kx-table"><thead><tr><th>{t('التاريخ', 'Date')}</th><th>{t('الحالة', 'Case')}</th><th>{t('المتابعة', 'Follow-up')}</th></tr></thead><tbody>{sortedCases.map(c => <tr key={c.id}>
                      <td>{new Date(c.date).toLocaleDateString(locale)}</td>
                      <td>{c.type}{c.arrivalTime && <span className="parent-small-time">{t('الوصول: ', 'Arrival: ')}{c.arrivalTime}</span>}{c.exitTime && <span className="parent-small-time">{t('الخروج: ', 'Exit: ')}{c.exitTime}</span>}</td>
                      <td><Badge tone={c.followStatus === 'open' ? 'amber' : c.followStatus === 'done' ? 'green' : 'slate'}>{followLabel[c.followStatus] || c.followStatus}</Badge></td>
                    </tr>)}</tbody></table></div>
                    : <Empty icon={<ShieldCheck size={24}/>}>{t('لا توجد حالات مسجلة', 'No student cases recorded')}</Empty>}
                </Card>
              </TabPanel>

              <TabPanel idPrefix="portal" id="cafeteria" active={section === 'cafeteria'}>
                <FushatiParent schoolId={child.schoolId} studentId={child.id} studentName={child.name} schoolName={child.schoolName} language={language} view={cafeteriaView} onViewChange={setCafeteriaView}/>
              </TabPanel>
            </>}
          </>}
      {result?.updatedAt && <p className="parent-updated">{t('آخر تحديث:', 'Last updated:')} {new Date(result.updatedAt).toLocaleString(locale)}</p>}
    </main>
    <GuidedTour platform="parent" open={tour.open} onClose={tour.close} language={language} onSection={openSection}/>
  </div>;
}
