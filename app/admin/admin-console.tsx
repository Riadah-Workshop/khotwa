'use client';
import {useCallback, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import {Archive, Building2, ChartColumn, Check, CircleHelp, DoorOpen, KeyRound, Languages, LayoutGrid, LockKeyhole, LogOut, Pencil, Plus, Power, RefreshCw, School as SchoolIcon, Search, ShieldCheck, ShoppingBasket, Trash2, TriangleAlert, UserPlus, Users, X} from 'lucide-react';
import {SCHOOL_TABLES} from '../../lib/school-sql';
import {SAUDI_REGIONS, saudiRegion, saudiCity} from '../../lib/saudi-locations';
import {SCHOOL_STAGES} from '../../lib/school-stages';
import '../ui/kx.css';
import './admin.css';
import {Badge, Card, Chip, Empty, Notice, PageHead, Stat, TabPanel, Tabs} from '../ui/kx';
import type {Tone} from '../ui/kx';
import {GuidedTour, TourHelpButton, useTour} from '../ui/tour';

type School = {id: string; code: string; name: string; region: string; city: string; stage: string; active: number; studentCount: number; deputyCount: number};
type Account = {id: string; school_id: string; email: string; full_name: string; role: 'deputy' | 'manager'; active: number; password_set_at: string | null; first_login_at: string | null; invitation_status: string; invitation_error_code: string | null; email_accepted_at: string | null; email_delivered_at: string | null};
type RecordRow = Record<string, string | number | null>;
type SchoolDraft = {name: string; code: string; region: string; city: string; stage: string};
type AdminSection = 'overview' | 'schools' | 'users' | 'cafeteria' | 'records' | 'security';

const labels: Record<string, [string, string]> = {students: ['الطلاب', 'Students'], cases: ['الحالات', 'Cases'], contacts: ['التواصل', 'Contacts'], followups: ['المتابعات', 'Follow-ups'], settings: ['الإعدادات', 'Settings'], attendance: ['الحضور', 'Attendance'], attendance_rounds: ['جولات الحضور', 'Attendance rounds'], attendance_audit: ['سجل تدقيق الحضور', 'Attendance audit'], absence_followups: ['متابعة الغياب', 'Absence follow-ups'], absence_events: ['أحداث الغياب', 'Absence events'], case_revisions: ['سجل تغييرات الحالات', 'Case revisions'], parent_grants: ['تصاريح أولياء الأمور', 'Parent grants'], student_families: ['الأسر', 'Student families'], school_trips: ['الرحلات والأنشطة', 'Trips and activities'], school_trip_students: ['مشاركو الرحلات', 'Trip participants'], school_tasks: ['المهام', 'Tasks'], school_evidence: ['الشواهد', 'Evidence'], student_care: ['رعاية الطلاب', 'Student care'], care_intake: ['مدخلات الرعاية', 'Care intake'], desk_closures: ['إغلاقات المكتب', 'Desk closures'], platform_papers: ['أوراق المنصة', 'Platform papers'], compatibility_runs: ['اختبارات التوافق', 'Compatibility runs'], student_movements: ['حركة الطلاب', 'Student movements']};
const errorCodes: Record<string, [string, string]> = {SMTP_AUTH_FAILED: ['فشل المصادقة لدى Hostinger (SMTP 535)', 'Hostinger authentication failed (SMTP 535)'], SMTP_STAGE_CONNECT: ['فشل اتصال SMTP', 'SMTP connection failed'], SMTP_CONNECTION_FAILED: ['فشل الاتصال بخادم البريد', 'SMTP server connection failed'], SMTP_CONNECTION_TIMEOUT: ['انتهت مهلة اتصال البريد', 'SMTP connection timed out'], SMTP_SENDER_MISMATCH: ['عنوان المرسل غير مطابق لحساب SMTP', 'Sender does not match SMTP account'], EMAIL_SENDER_MISSING: ['لم يُضبط عنوان مرسل البريد', 'Email sender not configured'], SMTP_STAGE_AUTH: ['فشل المصادقة أثناء تسجيل دخول SMTP', 'SMTP authentication step failed'], EMAIL_UNKNOWN_ERROR: ['خطأ غير محدد في البريد؛ راجع Coolify', 'Unspecified mail error; check Coolify logs']};
const statuses: Record<string, [string, string]> = {queued: ['قيد الإرسال', 'Queued'], accepted: ['قبله مزود البريد', 'Accepted by provider'], smtp_accepted: ['قبله خادم Hostinger؛ لم يتم تأكيد التسليم', 'Accepted by Hostinger; delivery unconfirmed'], delivered: ['وصل إلى خادم المستلم', 'Delivered to recipient server'], failed: ['فشل الإرسال', 'Sending failed'], bounced: ['ارتد البريد', 'Bounced'], delayed: ['تأخر التسليم', 'Delayed'], legacy: ['حساب سابق', 'Legacy account']};
const INVITATION_TONE: Record<string, Tone> = {delivered: 'green', accepted: 'teal', smtp_accepted: 'blue', queued: 'slate', delayed: 'amber', failed: 'red', bounced: 'red', legacy: 'slate'};
const emptySchool: SchoolDraft = {name: '', code: '', region: '', city: '', stage: 'general'};

function fmt(v: string | null, en: boolean) {
  return v ? new Date(v).toLocaleString(en ? 'en-GB' : 'ar-SA', {dateStyle: 'short', timeStyle: 'short'}) : '—';
}

export default function AdminConsole({activeSchoolId, tourKey}: {activeSchoolId: string; tourKey?: string}) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [schools, setSchools] = useState<School[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [legacyStudents, setLegacyStudents] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState('');
  const [recordSchool, setRecordSchool] = useState('');
  const [table, setTable] = useState('students');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [recordKey, setRecordKey] = useState('id');
  const [recordsError, setRecordsError] = useState('');
  const [recordPage, setRecordPage] = useState(0);
  const [recordHasMore, setRecordHasMore] = useState(false);
  const [school, setSchool] = useState<SchoolDraft>(emptySchool);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [account, setAccount] = useState({schoolId: '', fullName: '', email: '', role: 'deputy'});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminCurrent, setAdminCurrent] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [section, setSection] = useState<AdminSection>('overview');
  const [parentPhone, setParentPhone] = useState('');
  const tour = useTour('admin', tourKey, loaded);

  const en = lang === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const side: 'ar' | 'en' = en ? 'en' : 'ar';

  useEffect(() => {
    try { setLang(localStorage.getItem('khotwa:admin-language') === 'en' ? 'en' : 'ar'); } catch { /* storage blocked: keep Arabic */ }
  }, []);
  function changeLanguage(value: 'ar' | 'en') {
    setLang(value);
    try { localStorage.setItem('khotwa:admin-language', value); } catch { /* the choice lasts until reload */ }
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/admin', {cache: 'no-store'});
    const v = await r.json();
    if (!r.ok) throw new Error(v.error || 'Could not load accounts');
    setSchools(v.schools);
    setAccounts(v.accounts);
    setLegacyStudents(v.legacyStudents || 0);
    setAdminEmail(v.adminEmail || '');
    setSelected(s => (v.schools.some((x: School) => x.id === s) ? s : v.schools[0]?.id || ''));
    setRecordSchool(s => (v.schools.some((x: School) => x.id === s) ? s : v.schools[0]?.id || 'default'));
    setAccount(a => ({...a, schoolId: v.schools.some((x: School) => x.id === a.schoolId) ? a.schoolId : v.schools[0]?.id || ''}));
    setLoaded(true);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);

  async function save(op: string, data: unknown) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await fetch('/api/admin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op, data})});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || 'Save failed');
      setMessage(v.invitationStatus === 'failed'
        ? t('تم حفظ الحساب لكن إرسال البريد فشل: ', 'Account saved but email failed: ') + (errorCodes[v.invitationErrorCode]?.[en ? 1 : 0] || v.invitationErrorCode || 'Unknown')
        : v.invitationStatus === 'smtp_accepted'
          ? t('قبل Hostinger إرسال الدعوة؛ لم يُؤكد التسليم. تابع التفعيل أدناه.', 'Hostinger accepted the email. Delivery is not confirmed; track activation below.')
          : t('تم تنفيذ العملية بنجاح', 'Saved successfully'));
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function switchSchool(id: string) {
    if (await save('switch-school', {schoolId: id})) window.location.assign('/');
  }
  async function loadRecords(page = 0) {
    if (!recordSchool) return;
    setRecordsError('');
    try {
      const r = await fetch('/api/admin/records?' + new URLSearchParams({schoolId: recordSchool, table, q: query, page: String(page)}), {cache: 'no-store'});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || 'Failed');
      setRows(v.rows || []);
      setRecordKey(v.key || 'id');
      setRecordPage(page);
      setRecordHasMore(!!v.hasMore);
      if (v.error) setRecordsError(v.error);
    } catch (e) {
      setRecordsError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { setRows([]); setRecordPage(0); setRecordHasMore(false); }, [recordSchool, table, query]);
  useEffect(() => { if (editingSchool) document.getElementById('admin-edit-school')?.scrollIntoView({block: 'start', behavior: 'smooth'}); }, [editingSchool?.id]);

  const openSection = useCallback((value: string) => {
    if (['overview', 'schools', 'users', 'cafeteria', 'records', 'security'].includes(value)) setSection(value as AdminSection);
  }, []);

  const activeAccounts = accounts.filter(a => a.active);
  const failedInvitations = activeAccounts.filter(a => a.invitation_status === 'failed');
  const pendingActivation = activeAccounts.filter(a => !a.password_set_at && a.invitation_status !== 'failed');
  const inactiveSchools = schools.filter(s => !s.active);
  const needsAttention = failedInvitations.length + pendingActivation.length + inactiveSchools.length + (legacyStudents > 0 ? 1 : 0);
  const regionName = (id: string) => saudiRegion(id)?.[side] || '—';
  const cityName = (region: string, city: string) => saudiCity(region, city)?.[side] || '—';
  const roleName = (role: string) => (role === 'manager' ? t('مدير المدرسة', 'School Manager') : t('وكيل شؤون الطلاب', 'Student Affairs Agent'));

  function schoolFields(value: SchoolDraft, change: (next: SchoolDraft) => void, extra?: ReactNode, placeholder?: string) {
    return <div className="kx-form-grid">
      <label className="kx-field">{t('اسم المدرسة', 'School name')}<input className="kx-input" required minLength={3} maxLength={180} value={value.name} onChange={e => change({...value, name: e.target.value})}/></label>
      <label className="kx-field">{t('رمز المدرسة', 'School code')}<input className="kx-input" required dir="ltr" maxLength={25} pattern="[A-Za-z0-9-]{2,25}" placeholder={placeholder} value={value.code} onChange={e => change({...value, code: e.target.value.toUpperCase()})}/></label>
      <label className="kx-field">{t('المنطقة', 'Province')}<select className="kx-select" required value={value.region} onChange={e => change({...value, region: e.target.value, city: ''})}><option value="">{t('اختر المنطقة', 'Select province')}</option>{SAUDI_REGIONS.map(r => <option key={r.id} value={r.id}>{r[side]}</option>)}</select></label>
      <label className="kx-field">{t('المدينة', 'City')}<select className="kx-select" required value={value.city} onChange={e => change({...value, city: e.target.value})}><option value="">{t('اختر المدينة', 'Select city')}</option>{saudiRegion(value.region)?.cities.map(c => <option key={c.id} value={c.id}>{c[side]}</option>)}</select></label>
      <label className="kx-field">{t('المرحلة الدراسية', 'School stage')}<select className="kx-select" required value={value.stage || 'general'} onChange={e => change({...value, stage: e.target.value})}>{SCHOOL_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage[side]}</option>)}</select></label>
      {extra}
    </div>;
  }

  async function deleteSchool(s: School) {
    const code = prompt(t('حذف نهائي للمدرسة وجميع بياناتها ومرفقاتها وحساباتها! اكتب رمز المدرسة للتأكيد:', 'PERMANENTLY delete the school, its data, attachments and accounts! Type the school code:'), '');
    if (code !== s.code) return;
    if (confirm(t('تأكيد نهائي: لا يمكن التراجع. احتفظ بنسخة احتياطية.', 'Final confirmation: This cannot be undone. Back up first.'))) await save('delete-school', {schoolId: s.id, confirmCode: code});
  }
  async function editAccount(u: Account) {
    const fullName = prompt(t('الاسم الجديد', 'Updated name'), u.full_name);
    if (!fullName) return;
    const code = prompt(t('رمز المدرسة الجديدة', 'New school code'), schools.find(s => s.id === u.school_id)?.code || '');
    const schoolId = schools.find(s => s.code === code?.trim().toUpperCase())?.id;
    if (!schoolId) { setError(t('رمز مدرسة غير صحيح', 'Invalid school code')); return; }
    await save('edit-account', {id: u.id, schoolId, fullName, active: !!u.active});
  }
  function deleteAccount(u: Account) {
    const email = prompt(t('اكتب البريد الإلكتروني للتأكيد والحذف النهائي', 'Type the email address to confirm permanent deletion'));
    if (email === u.email && confirm(t('حذف هذا الحساب بشكل نهائي؟', 'Permanently delete this account?'))) save('delete-account', {id: u.id, confirmEmail: email});
  }
  async function deleteRecord(row: RecordRow) {
    const key = String(row[recordKey] || '');
    const confirmKey = prompt(t('للتأكيد اكتب معرّف السجل حرفيًا: ', 'Type the exact record key to confirm deletion: ') + key);
    if (confirmKey !== key) return;
    if (await save('delete-record', {schoolId: recordSchool, table, key})) loadRecords();
  }
  function deleteParent() {
    if (!parentPhone) return;
    const confirmPhone = prompt(t('أعد إدخال رقم الجوال لحذف حساب ولي الأمر نهائيًا', 'Re-enter phone number to permanently delete parent access'));
    if (confirmPhone === parentPhone) save('delete-parent', {schoolId: selected, phone: parentPhone});
  }

  return <div className="kx-scope" data-accent="violet" dir={en ? 'ltr' : 'rtl'} lang={lang}>
    <header className="kx-topbar">
      <div className="kx-brand"><span className="kx-brand-mark"><ShieldCheck size={26}/></span><div><strong>{t('خطوة • الإدارة المركزية', 'Khotwa • Central Administration')}</strong><small>{t('مدير النظام', 'System administrator')}</small></div></div>
      <div className="kx-topbar-actions" data-tour="tools">
        <button type="button" className="kx-btn" onClick={() => changeLanguage(en ? 'ar' : 'en')} aria-label={en ? 'العربية' : 'English'}><Languages size={18}/><span className="kx-btn-text">{en ? 'العربية' : 'English'}</span></button>
        <TourHelpButton language={lang} onClick={tour.start}/>
        <a className="kx-btn" href="/manager" aria-label={t('تقارير مدير المدرسة', 'Manager reports')}><ChartColumn size={18}/><span className="kx-btn-text">{t('تقارير مدير المدرسة', 'Manager reports')}</span></a>
        <a className="kx-btn" href="/admin" aria-label={t('تحديث', 'Refresh')}><RefreshCw size={18}/><span className="kx-btn-text">{t('تحديث', 'Refresh')}</span></a>
        <a className="kx-btn" href="/logout?next=/admin-login" aria-label={t('تسجيل الخروج', 'Sign out')}><LogOut size={18}/><span className="kx-btn-text">{t('تسجيل الخروج', 'Sign out')}</span></a>
      </div>
    </header>

    <main className="kx-page">
      <PageHead icon={<ShieldCheck size={26}/>} tone="violet" title={t('إدارة المدارس والصلاحيات', 'Schools & Access Management')} description={t('مدير النظام: كل المدارس والحسابات والعمليات الحساسة.', 'System administrator: all schools, accounts, and privileged operations.')}/>
      {error && <Notice tone="red" icon={<X size={18}/>} role="alert">{error}</Notice>}
      {message && <Notice tone="green" icon={<Check size={18}/>} role="status">{message}</Notice>}

      <Tabs idPrefix="admin" label={t('أقسام الإدارة', 'Administration sections')} value={section} onChange={id => setSection(id as AdminSection)} rtl={!en} tourId="admin-sections" items={[
        {id: 'overview', label: t('نظرة عامة', 'Overview'), icon: <LayoutGrid size={18}/>, tone: 'violet', badge: needsAttention},
        {id: 'schools', label: t('المدارس', 'Schools'), icon: <Building2 size={18}/>, tone: 'green'},
        {id: 'users', label: t('المستخدمون', 'Users'), icon: <Users size={18}/>, tone: 'blue'},
        {id: 'cafeteria', label: t('المقاصف', 'Cafeterias'), icon: <ShoppingBasket size={18}/>, tone: 'amber'},
        {id: 'records', label: t('السجلات', 'Records'), icon: <Archive size={18}/>, tone: 'red'},
        {id: 'security', label: t('الأمان', 'Security'), icon: <LockKeyhole size={18}/>, tone: 'slate'},
      ]}/>

      <TabPanel idPrefix="admin" id="overview" active={section === 'overview'}>
        <div className="kx-grid cols-4 keep-2" data-tour="admin-stats">
          <Stat icon={<Building2 size={22}/>} tone="green" label={t('المدارس الفعلية', 'Schools')} value={schools.length} hint={inactiveSchools.length ? t(`${inactiveSchools.length} موقوفة`, `${inactiveSchools.length} disabled`) : t('كلها نشطة', 'All active')}/>
          <Stat icon={<Users size={22}/>} tone="teal" label={t('الطلاب في المدارس', 'Students across schools')} value={schools.reduce((n, s) => n + s.studentCount, 0)}/>
          <Stat icon={<UserPlus size={22}/>} tone="blue" label={t('حسابات الوكلاء والمديرين النشطة', 'Active agents and managers')} value={activeAccounts.length}/>
          <Stat icon={<TriangleAlert size={22}/>} tone={needsAttention ? 'amber' : 'slate'} label={t('تحتاج انتباهاً', 'Needs attention')} value={needsAttention} hint={needsAttention ? t('راجع القائمة أدناه', 'See the list below') : t('لا شيء معلّق', 'Nothing pending')}/>
        </div>
        <div className="kx-grid cols-2">
          <Card tone="amber" icon={<TriangleAlert size={18}/>} title={t('تحتاج انتباهاً', 'Needs attention')} description={t('أمور تعطّل عمل المستخدمين أو تستحق المراجعة.', 'Things that block users or deserve a look.')}>
            {needsAttention === 0 && <Empty icon={<Check size={24}/>}>{t('كل شيء على ما يرام: لا دعوات فاشلة ولا حسابات بانتظار التفعيل.', 'All good: no failed invitations and no accounts waiting for activation.')}</Empty>}
            {failedInvitations.length > 0 && <Notice tone="red" icon={<X size={18}/>} title={t(`${failedInvitations.length} دعوة فشل إرسالها`, `${failedInvitations.length} invitation(s) failed to send`)}>{failedInvitations.map(a => a.full_name).join('، ')}</Notice>}
            {pendingActivation.length > 0 && <Notice tone="amber" icon={<KeyRound size={18}/>} title={t(`${pendingActivation.length} حساب بانتظار تعيين كلمة المرور`, `${pendingActivation.length} account(s) waiting to set a password`)}>{pendingActivation.map(a => a.full_name).join('، ')}</Notice>}
            {inactiveSchools.length > 0 && <Notice tone="slate" icon={<Building2 size={18}/>} title={t(`${inactiveSchools.length} مدرسة موقوفة`, `${inactiveSchools.length} school(s) disabled`)}>{inactiveSchools.map(s => s.name).join('، ')}</Notice>}
            {legacyStudents > 0 && <Notice tone="blue" icon={<Archive size={18}/>} title={t(`${legacyStudents} طالبًا في بيانات MAIN القديمة`, `${legacyStudents} students in legacy MAIN data`)}>{t('لم تُحذف هذه البيانات حفاظًا عليها.', 'This data has been preserved.')} <button type="button" className="kx-btn is-small" data-tone="blue" onClick={() => switchSchool('default')} disabled={busy}><DoorOpen size={15}/>{t('فتح البيانات القديمة', 'Open legacy data')}</button></Notice>}
            {needsAttention > 0 && (failedInvitations.length > 0 || pendingActivation.length > 0) && <div className="kx-btn-row"><button type="button" className="kx-btn is-soft" data-tone="blue" onClick={() => setSection('users')}><Users size={17}/>{t('فتح المستخدمين', 'Open users')}</button></div>}
          </Card>
          <Card tone="violet" icon={<Plus size={18}/>} title={t('إجراءات سريعة', 'Quick actions')} description={t('أكثر ما يحتاجه مدير النظام.', 'What a system administrator needs most often.')}>
            <div className="admin-actions-grid">
              <button type="button" className="admin-action" data-tone="green" onClick={() => setSection('schools')}><Chip tone="green" icon={<Building2 size={20}/>}/><span><strong>{t('إنشاء مدرسة', 'Create a school')}</strong><small>{t('أضف مدرسة جديدة ورمزها ومنطقتها', 'Add a school with its code and region')}</small></span></button>
              <button type="button" className="admin-action" data-tone="blue" onClick={() => setSection('users')}><Chip tone="blue" icon={<UserPlus size={20}/>}/><span><strong>{t('دعوة مستخدم', 'Invite a user')}</strong><small>{t('وكيل شؤون الطلاب أو مدير المدرسة', 'Student Affairs Agent or School Manager')}</small></span></button>
              <a className="admin-action" data-tone="amber" href="/fushati/admin"><Chip tone="amber" icon={<ShoppingBasket size={20}/>}/><span><strong>{t('لوحة فسحتي', 'Fushati dashboard')}</strong><small>{t('المقاصف والموظفون والحوالات', 'Cafeterias, staff and transfers')}</small></span></a>
              <a className="admin-action" data-tone="teal" href="/manager"><Chip tone="teal" icon={<ChartColumn size={20}/>}/><span><strong>{t('تقارير المدراء', 'Manager reports')}</strong><small>{t('لوحة التقارير والمؤشرات', 'Reports and indicators dashboard')}</small></span></a>
            </div>
          </Card>
        </div>
      </TabPanel>

      <TabPanel idPrefix="admin" id="schools" active={section === 'schools'}>
        <Card tourId="admin-schools" tone="green" icon={<Building2 size={18}/>} title={t('المدارس', 'Schools')} description={t('MAIN مخفية لأنها قسم النظام القديم وليست مدرسة فعلية. تستطيع فتح كل مدرسة بصلاحيات المدير.', 'MAIN is hidden because it represents legacy system data, not a real school. The administrator can enter each school.')}>
          {legacyStudents > 0 && <Notice tone="blue" icon={<Archive size={18}/>}>{t(`يوجد ${legacyStudents} طالبًا في بيانات MAIN القديمة. لم تُحذف هذه البيانات حفاظًا عليها.`, `${legacyStudents} students remain in legacy MAIN data. This data has been preserved.`)} <button type="button" className="kx-btn is-small" data-tone="blue" onClick={() => switchSchool('default')} disabled={busy}><DoorOpen size={15}/>{t('فتح البيانات القديمة', 'Open legacy data')}</button></Notice>}
          {schools.length === 0 ? <Empty icon={<Building2 size={24}/>}>{t('لا توجد مدارس بعد. أنشئ أول مدرسة من النموذج أدناه.', 'No schools yet. Create the first one with the form below.')}</Empty>
            : <div className="admin-cards">{schools.map(s => <article key={s.id} className="admin-item" data-tone={s.active ? 'green' : 'slate'}>
              <div className="admin-item-head"><Chip tone={s.active ? 'green' : 'slate'} icon={<SchoolIcon size={20}/>}/><div><strong>{s.name}</strong><small dir="ltr">{s.code}</small></div></div>
              <div className="admin-steps"><Badge tone={s.active ? 'green' : 'slate'}>{s.active ? t('نشطة', 'Active') : t('موقوفة', 'Disabled')}</Badge>{activeSchoolId === s.id && <Badge tone="violet">{t('المدرسة المفتوحة', 'Currently opened')}</Badge>}</div>
              <dl className="admin-facts">
                <div><dt>{t('المنطقة والمدينة', 'Province / City')}</dt><dd>{regionName(s.region)} / {cityName(s.region, s.city)}</dd></div>
                <div><dt>{t('المرحلة', 'Stage')}</dt><dd>{SCHOOL_STAGES.find(stage => stage.id === (s.stage || 'general'))?.[side] || s.stage}</dd></div>
                <div><dt>{t('الطلاب', 'Students')}</dt><dd>{s.studentCount}</dd></div>
                <div><dt>{t('الحسابات', 'Accounts')}</dt><dd>{s.deputyCount}</dd></div>
              </dl>
              <div className="kx-btn-row">
                <button type="button" className="kx-btn is-solid is-small" data-tone="green" disabled={busy || !s.active} onClick={() => switchSchool(s.id)}><DoorOpen size={16}/>{t('فتح', 'Open')}</button>
                <button type="button" className="kx-btn is-small" data-tone="blue" disabled={busy} onClick={() => { setEditingSchool(s); setSection('schools'); }}><Pencil size={16}/>{t('تعديل / إعادة تسمية', 'Edit / rename')}</button>
                <button type="button" className="kx-btn is-small" data-tone="red" disabled={busy} onClick={() => deleteSchool(s)}><Trash2 size={16}/>{t('حذف نهائي', 'Delete permanently')}</button>
              </div>
            </article>)}</div>}
        </Card>
        {editingSchool && <Card id="admin-edit-school" tone="blue" icon={<Pencil size={18}/>} title={t('تعديل المدرسة', 'Edit school')} description={editingSchool.name}>
          <form className="kx-grid" onSubmit={async e => { e.preventDefault(); if (await save('edit-school', {id: editingSchool.id, name: editingSchool.name, code: editingSchool.code, active: !!editingSchool.active, region: editingSchool.region, city: editingSchool.city, stage: editingSchool.stage})) setEditingSchool(null); }}>
            {schoolFields(editingSchool, next => setEditingSchool({...editingSchool, ...next}), <label className="kx-check"><input type="checkbox" checked={!!editingSchool.active} onChange={e => setEditingSchool({...editingSchool, active: e.target.checked ? 1 : 0})}/>{t('مدرسة نشطة', 'Active school')}</label>)}
            <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="blue" disabled={busy}><Check size={18}/>{t('حفظ التغييرات', 'Save changes')}</button><button type="button" className="kx-btn" onClick={() => setEditingSchool(null)}><X size={18}/>{t('إلغاء', 'Cancel')}</button></div>
          </form>
        </Card>}
        <Card tourId="admin-create-school" tone="green" icon={<Plus size={18}/>} title={t('إنشاء مدرسة', 'Create school')} description={t('رمز المدرسة يُستخدم في الدخول والتقارير؛ اختر رمزاً قصيراً لا يتكرر.', 'The code is used for sign-in and reports; choose a short, unique one.')}>
          <form className="kx-grid" onSubmit={e => { e.preventDefault(); save('create-school', school).then(ok => { if (ok) setSchool(emptySchool); }); }}>
            {schoolFields(school, setSchool, undefined, 'SCH-001')}
            <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="green" disabled={busy}><Plus size={18}/>{t('إنشاء مدرسة', 'Create school')}</button></div>
          </form>
        </Card>
      </TabPanel>

      <TabPanel idPrefix="admin" id="users" active={section === 'users'}>
        <Card tourId="admin-users" tone="blue" icon={<Users size={18}/>} title={t('الوكلاء ومديرو المدارس', 'Student Affairs Agents & School Managers')} description={t('تصل دعوة تعيين كلمة المرور إلى البريد. تابع الحالة وأول دخول. دور مدير المدرسة للقراءة والتقارير فقط.', 'Users receive an email link to set their own password. Track invitation and first login. School managers can view reports only.')} actions={<button type="button" className="kx-btn is-small" data-tone="blue" onClick={() => load()} disabled={busy}><RefreshCw size={16}/>{t('تحديث حالة الدعوات', 'Refresh invitation status')}</button>}>
          {accounts.length === 0 ? <Empty icon={<Users size={24}/>}>{t('لا توجد حسابات بعد. ادعُ أول مستخدم من النموذج أدناه.', 'No accounts yet. Invite the first user with the form below.')}</Empty>
            : <div className="admin-cards">{accounts.map(u => <article key={u.id} className="admin-item" data-tone={u.active ? 'blue' : 'slate'}>
              <div className="admin-item-head"><Chip tone={u.role === 'manager' ? 'violet' : 'blue'} icon={u.role === 'manager' ? <ChartColumn size={20}/> : <Users size={20}/>}/><div><strong>{u.full_name}</strong><small>{roleName(u.role)}</small></div></div>
              <dl className="admin-facts">
                <div className="wide"><dt>{t('المدرسة', 'School')}</dt><dd>{schools.find(s => s.id === u.school_id)?.name || '—'}</dd></div>
                <div className="wide"><dt>{t('البريد', 'Email')}</dt><dd dir="ltr">{u.email}</dd></div>
              </dl>
              <div className="admin-steps">
                <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? t('نشط', 'Active') : t('موقوف', 'Disabled')}</Badge>
                <Badge tone={INVITATION_TONE[u.invitation_status] || 'slate'}>{statuses[u.invitation_status]?.[en ? 1 : 0] || u.invitation_status}</Badge>
                <Badge tone={u.password_set_at ? 'green' : 'amber'} icon={u.password_set_at ? <Check size={13}/> : undefined}>{u.password_set_at ? t('تم تعيين كلمة المرور', 'Password set') : t('بانتظار التفعيل', 'Pending activation')}</Badge>
                <Badge tone={u.first_login_at ? 'green' : 'slate'} icon={u.first_login_at ? <Check size={13}/> : undefined}>{u.first_login_at ? t('أول دخول ناجح', 'First login completed') : t('لم يسجل الدخول', 'Not logged in yet')}</Badge>
              </div>
              {u.invitation_status === 'failed' && <Notice tone="red" icon={<TriangleAlert size={18}/>}>{errorCodes[u.invitation_error_code || '']?.[en ? 1 : 0] || u.invitation_error_code}</Notice>}
              <details className="admin-more"><summary>{t('تفاصيل البريد والتفعيل', 'Email and activation details')}</summary>
                <dl className="admin-facts">
                  <div><dt>{t('قبول الإرسال: ', 'Email accepted: ')}</dt><dd>{fmt(u.email_accepted_at, en)}</dd></div>
                  <div><dt>{t('تسليم البريد: ', 'Delivered: ')}</dt><dd>{u.invitation_status === 'smtp_accepted' ? t('تأكيد التسليم غير متاح عبر SMTP', 'SMTP delivery confirmation unavailable') : fmt(u.email_delivered_at, en)}</dd></div>
                  <div><dt>{t('كلمة المرور', 'Password set')}</dt><dd>{fmt(u.password_set_at, en)}</dd></div>
                  <div><dt>{t('أول دخول', 'First login')}</dt><dd>{fmt(u.first_login_at, en)}</dd></div>
                </dl>
              </details>
              <div className="kx-btn-row">
                <button type="button" className="kx-btn is-small" data-tone="blue" disabled={busy} onClick={() => editAccount(u)}><Pencil size={16}/>{t('تعديل / نقل', 'Edit / move')}</button>
                <button type="button" className="kx-btn is-small" data-tone={u.active ? 'amber' : 'green'} disabled={busy} onClick={() => save('edit-account', {id: u.id, schoolId: u.school_id, fullName: u.full_name, active: !u.active})}><Power size={16}/>{u.active ? t('إيقاف', 'Disable') : t('تفعيل', 'Enable')}</button>
                <button type="button" className="kx-btn is-small" data-tone="teal" disabled={busy || !u.active} onClick={() => { if (confirm(t('إرسال رابط آمن لتعيين كلمة المرور؟', 'Send a secure password-set/reset link?'))) save('resend-account', {id: u.id}); }}><KeyRound size={16}/>{t('إرسال رابط الدخول', 'Send access link')}</button>
                <button type="button" className="kx-btn is-small" data-tone="red" disabled={busy} onClick={() => deleteAccount(u)}><Trash2 size={16}/>{t('حذف', 'Delete')}</button>
              </div>
            </article>)}</div>}
        </Card>
        <Card tourId="admin-invite" tone="green" icon={<UserPlus size={18}/>} title={t('دعوة حساب جديد', 'Invite a new user')} description={t('يصل المستخدم رابط آمن ليعيّن كلمة المرور بنفسه.', 'The user receives a secure link and sets their own password.')}>
          <form className="kx-grid" onSubmit={e => { e.preventDefault(); save(account.role === 'manager' ? 'create-manager' : 'create-deputy', account).then(ok => { if (ok) setAccount({...account, fullName: '', email: ''}); }); }}>
            <div className="kx-form-grid">
              <label className="kx-field">{t('الاسم', 'Full name')}<input className="kx-input" required minLength={3} maxLength={150} value={account.fullName} onChange={e => setAccount({...account, fullName: e.target.value})}/></label>
              <label className="kx-field">{t('البريد الإلكتروني', 'Email')}<input className="kx-input" required type="email" dir="ltr" value={account.email} onChange={e => setAccount({...account, email: e.target.value})}/></label>
              <label className="kx-field">{t('الدور', 'Role')}<select className="kx-select" value={account.role} onChange={e => setAccount({...account, role: e.target.value})}><option value="deputy">{t('وكيل شؤون الطلاب', 'Student Affairs Agent')}</option><option value="manager">{t('مدير المدرسة', 'School Manager')}</option></select></label>
              <label className="kx-field">{t('المدرسة', 'School')}<select className="kx-select" required value={account.schoolId} onChange={e => setAccount({...account, schoolId: e.target.value})}>{schools.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            </div>
            <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="green" disabled={busy || !schools.some(s => s.active)}><UserPlus size={18}/>{t('إنشاء وإرسال الدعوة', 'Create & send invitation')}</button></div>
          </form>
        </Card>
      </TabPanel>

      <TabPanel idPrefix="admin" id="cafeteria" active={section === 'cafeteria'}>
        <Card tourId="admin-cafeteria" tone="amber" icon={<ShoppingBasket size={18}/>} title={t('فسحتي — إدارة المقاصف المدرسية', 'Fushati — Cafeteria Management')} description={t('إدارة المقاصف، مديرو فسحتي، الموظفون، اعتماد الحوالات والتقارير.', 'Manage cafeterias, Fushati administrators, staff, transfer approvals and reports.')}>
          <div className="kx-btn-row"><a href="/fushati/admin" className="kx-btn is-solid" data-tone="amber"><ShoppingBasket size={18}/>{t('فتح لوحة فسحتي', 'Open Fushati dashboard')}</a></div>
        </Card>
      </TabPanel>

      <TabPanel idPrefix="admin" id="records" active={section === 'records'}>
        <Notice tone="red" icon={<TriangleAlert size={18}/>} title={t('منطقة حساسة', 'Sensitive area')}>{t('الحذف هنا نهائي ولا يمكن التراجع عنه. احتفظ بنسخة احتياطية قبل أي حذف.', 'Deleting here is permanent and cannot be undone. Take a backup before deleting anything.')}</Notice>
        <Card tourId="admin-records" tone="red" icon={<Archive size={18}/>} title={t('إدارة سجلات كل مدرسة (للمدير فقط)', 'School Records Management (admin only)')} description={t('اختر المدرسة ونوع السجل للبحث والحذف النهائي. لن تُحذف السجلات المرتبطة دون حذف التبعيات أولاً.', 'Select a school and record type to search and delete. Linked records must be removed first.')}>
          <div className="kx-form-grid">
            <label className="kx-field">{t('المدرسة', 'School')}<select className="kx-select" value={recordSchool} onChange={e => setRecordSchool(e.target.value)}><option value="default">{t('أرشيف MAIN القديم', 'Legacy MAIN records')}</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="kx-field">{t('نوع السجلات', 'Record type')}<select className="kx-select" value={table} onChange={e => setTable(e.target.value)}>{SCHOOL_TABLES.map(name => <option key={name} value={name}>{labels[name]?.[en ? 1 : 0] || name}</option>)}</select></label>
            <label className="kx-field">{t('بحث بالاسم أو المعرف', 'Search by name or ID')}<input className="kx-input" maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label>
          </div>
          <div className="kx-btn-row"><button type="button" className="kx-btn is-solid" data-tone="slate" disabled={!recordSchool || busy} onClick={() => loadRecords(0)}><Search size={18}/>{t('عرض السجلات', 'Show records')}</button></div>
          {recordsError && <Notice tone="red" icon={<X size={18}/>} role="alert">{recordsError}</Notice>}
          {rows.length > 0 && <div className="kx-table-wrap"><table className="kx-table"><thead><tr><th>{t('مفتاح السجل', 'Record key')}</th><th>{t('الوصف', 'Summary')}</th><th>{t('الإجراء', 'Action')}</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}>
            <td dir="ltr">{String(row[recordKey] ?? '')}</td>
            <td><code className="admin-code">{Object.entries(row).filter(([k]) => k !== recordKey).map(([k, v]) => `${k}: ${String(v ?? '').slice(0, 85)}`).join(' · ').slice(0, 260)}</code></td>
            <td><button type="button" className="kx-btn is-small" data-tone="red" disabled={busy} onClick={() => deleteRecord(row)}><Trash2 size={16}/>{t('حذف', 'Delete')}</button></td>
          </tr>)}</tbody></table></div>}
          {(recordPage > 0 || recordHasMore) && <div className="kx-btn-row"><button type="button" className="kx-btn is-small" disabled={recordPage === 0 || busy} onClick={() => loadRecords(recordPage - 1)}>{t('السابق', 'Previous')}</button><Badge tone="slate">{t('الصفحة', 'Page')} {recordPage + 1}</Badge><button type="button" className="kx-btn is-small" disabled={!recordHasMore || busy} onClick={() => loadRecords(recordPage + 1)}>{t('التالي', 'Next')}</button></div>}
        </Card>
        <Card tone="red" icon={<Trash2 size={18}/>} title={t('حذف حساب ولي أمر', 'Delete a parent account')} description={t('يزيل وصول ولي الأمر في المدرسة المحددة. يُطلب إعادة كتابة الرقم للتأكيد.', "Removes the parent's access at the chosen school. You will be asked to type the number again.")}>
          <div className="kx-form-grid">
            <label className="kx-field">{t('المدرسة', 'School')}<select className="kx-select" value={selected} onChange={e => setSelected(e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="kx-field">{t('جوال ولي الأمر', 'Parent phone')}<input className="kx-input" dir="ltr" placeholder="05xxxxxxxx" value={parentPhone} onChange={e => setParentPhone(e.target.value)}/></label>
          </div>
          <div className="kx-btn-row"><button type="button" className="kx-btn" data-tone="red" disabled={!schools.some(s => s.id === selected) || busy || !parentPhone} onClick={deleteParent}><Trash2 size={18}/>{t('حذف حساب ولي الأمر', 'Delete parent account')}</button></div>
        </Card>
      </TabPanel>

      <TabPanel idPrefix="admin" id="security" active={section === 'security'}>
        <Card tourId="admin-security" tone="slate" icon={<LockKeyhole size={18}/>} title={t('بيانات مدير النظام', 'Administrator Credentials')} description={t('يمكنك تغيير بريد دخول المدير أو كلمة المرور. يجب تأكيد كلمة المرور الحالية وسيتم تسجيل الخروج من الجلسات السابقة.', 'Change the administrator login email or password after confirming the current password. Previous sessions will be revoked.')}>
          <form className="kx-grid" onSubmit={async e => { e.preventDefault(); if (!adminCurrent) return; const ok = await save('update-admin-security', {currentPassword: adminCurrent, newEmail: adminEmail, newPassword: adminPassword || undefined}); if (ok) window.location.assign('/logout?next=/admin-login'); }}>
            <div className="kx-form-grid">
              <label className="kx-field">{t('البريد الإلكتروني للدخول', 'Admin login email')}<input className="kx-input" type="email" dir="ltr" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)}/></label>
              <label className="kx-field">{t('كلمة المرور الحالية', 'Current password')}<input className="kx-input" type="password" required autoComplete="current-password" value={adminCurrent} onChange={e => setAdminCurrent(e.target.value)}/></label>
              <label className="kx-field">{t('كلمة المرور الجديدة (اختياري، 12 حرفاً فأكثر)', 'New password (optional, 12+ characters)')}<input className="kx-input" type="password" minLength={12} autoComplete="new-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}/></label>
            </div>
            <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="slate" disabled={busy}><Check size={18}/>{t('حفظ بيانات الدخول', 'Save administrator credentials')}</button></div>
          </form>
        </Card>
        <Notice tone="slate" icon={<CircleHelp size={18}/>}>{t('الأدوار: مدير النظام / وكيل شؤون الطلاب / مدير المدرسة / ولي الأمر / مدير فسحتي / موظف المقصف', 'Six roles: System Admin / Student Affairs Agent / School Manager / Parent / Fushati Admin / Cafeteria Agent')}</Notice>
      </TabPanel>
    </main>
    <GuidedTour platform="admin" accent="violet" open={tour.open} onClose={tour.close} language={lang} onSection={openSection}/>
  </div>;
}
