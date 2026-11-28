'use client';
// Diagnostics: the system administrator's view of how the platform and its apps are doing, so problems can be found
// and fixed in the next release. Nothing here is visible to any other role, and nothing in it is a position, a screen
// a person saw, or anything a person typed (see lib/app-report.ts).
import {useCallback, useEffect, useState} from 'react';
import {Activity, Bug, Check, CheckCheck, Database, HardDrive, Mail, RefreshCw, RotateCcw, Rocket, ShieldCheck, Smartphone, Trash2, TriangleAlert, History} from 'lucide-react';
import {Badge, Card, ConfirmButton, Empty, Notice, Stat} from '../ui/kx';
import type {Tone} from '../ui/kx';
import {ActionMenu} from '../ui/action-menu';
import type {DeviceProblem} from '../../lib/app-report';
import type {Snapshot} from '../../lib/app-diagnostics';

type Props = {lang: 'ar' | 'en'; active: boolean};
type Draft = {latest: string; minimum: string; storeUrl: string; notesAr: string; notesEn: string};
type Platform = 'android' | 'ios';

const ROLES: Record<string, [string, string]> = {
  main_admin: ['مدير النظام', 'System administrator'],
  deputy: ['وكيل شؤون الطلاب', 'Student Affairs agent'],
  manager: ['مدير المدرسة', 'School manager'],
  parent: ['ولي أمر', 'Parent'],
  fushati_admin: ['مدير فسحتي', 'Cafeteria administrator'],
  fushati_agent: ['موظف المقصف', 'Cafeteria agent'],
};
const KINDS: Record<string, [string, string]> = {
  script: ['خطأ في الصفحة', 'Page error'],
  promise: ['عملية فاشلة', 'Failed operation'],
  api: ['خطأ من الخادم', 'Server error'],
  render: ['تعطّل شاشة', 'Screen crash'],
  native: ['التطبيق', 'App'],
};
const PROBLEMS: Record<DeviceProblem, {text: [string, string]; tone: Tone}> = {
  location_not_allowed: {text: ['الموقع غير مسموح: لن تُسجَّل أوقات الوصول', 'Location not allowed: arrivals are not recorded'], tone: 'red'},
  background_not_allowed: {text: ['الموقع في الخلفية غير مسموح: يعمل أثناء فتح التطبيق فقط', 'Background location not allowed: works only while the app is open'], tone: 'amber'},
  camera_not_allowed: {text: ['الكاميرا غير مسموحة: لا يمكن مسح الباركود', 'Camera not allowed: cannot scan barcodes'], tone: 'red'},
  notifications_off: {text: ['الإشعارات مغلقة', 'Notifications are off'], tone: 'amber'},
  battery_saver: {text: ['موفّر البطارية مفعّل: قد يوقف التتبع', 'Battery saver is on: it may stop position updates'], tone: 'amber'},
  update_required: {text: ['إصدار أقدم من المسموح: يلزم التحديث', 'Older than allowed: update required'], tone: 'red'},
  update_available: {text: ['يتوفر إصدار أحدث', 'A newer version exists'], tone: 'slate'},
};
const RELEASE_ERRORS: Record<string, [string, string]> = {
  latest: ['أدخل رقم الإصدار الأحدث مثل 1.2.0', 'Enter the latest version, like 1.2.0'],
  minimum: ['رقم الحد الأدنى غير صحيح (مثل 1.0.0)', 'The minimum version is not valid (like 1.0.0)'],
  order: ['الحد الأدنى لا يمكن أن يتجاوز الإصدار الأحدث', 'The minimum cannot be above the latest version'],
  url: ['العنوان يجب أن يبدأ بـ https://', 'The link must start with https://'],
  platform: ['منصة غير معروفة', 'Unknown platform'],
};
const emptyDraft: Draft = {latest: '', minimum: '', storeUrl: '', notesAr: '', notesEn: ''};

export default function DiagnosticsPanel({lang, active}: Props) {
  const en = lang === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [solved, setSolved] = useState(false);
  const [role, setRole] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<Platform, Partial<Draft>>>>({});
  const [busy, setBusy] = useState(false);

  const when = (iso: string) => new Date(iso).toLocaleString(en ? 'en-GB' : 'ar-SA', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Riyadh'});
  const roleName = (value: string) => ROLES[value]?.[en ? 1 : 0] ?? value;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/diagnostics${solved ? '?solved=1' : ''}`, {cache: 'no-store'});
      const body = (await response.json()) as Snapshot & {error?: string};
      if (!response.ok) throw new Error(body.error || String(response.status));
      setData(body);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }, [solved]);

  // The load is queued, never a synchronous state change inside the effect.
  useEffect(() => {
    if (!active) return undefined;
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [active, load]);

  async function send(op: string, payload: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/diagnostics', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op, data: payload})});
      const body = (await response.json().catch(() => ({}))) as {error?: string};
      if (!response.ok) {
        const known = body.error ? RELEASE_ERRORS[body.error] : undefined;
        setError(known ? known[en ? 1 : 0] : body.error || String(response.status));
        return false;
      }
      setError('');
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const draftOf = (platform: Platform): Draft => {
    const saved = data?.releases[platform];
    const base: Draft = saved ? {latest: saved.latest, minimum: saved.minimum, storeUrl: saved.storeUrl, notesAr: saved.notesAr, notesEn: saved.notesEn} : emptyDraft;
    return {...base, ...drafts[platform]};
  };
  const edit = (platform: Platform, patch: Partial<Draft>) => setDrafts((current) => ({...current, [platform]: {...current[platform], ...patch}}));

  if (loading && !data) return <Notice tone="slate" icon={<RefreshCw size={18} />} role="status">{t('جارٍ تحميل التشخيص…', 'Loading diagnostics…')}</Notice>;
  if (!data) return <Notice tone="red" icon={<TriangleAlert size={18} />} role="alert">{error || t('تعذر تحميل التشخيص', 'Diagnostics could not be loaded')}</Notice>;

  const {health, counts} = data;
  const serverOk = health.database.ok && health.schemaMissing.length === 0;
  const stampsShown = data.signIns.filter((row) => !role || row.role === role);
  const attention = data.devices.filter((device) => device.problems.length > 0);

  return (
    <>
      <Notice tone="slate" icon={<ShieldCheck size={18} />}>
        {t('هذه الصفحة لمدير النظام وحده. لا تحتوي مواقع ولا محتوى شاشات ولا ما كتبه المستخدمون؛ فقط نوع المشكلة ومكانها وعدد مرات حدوثها، وحالة الهواتف وإصدارات التطبيق، وأوقات الدخول.', 'This page is for the system administrator only. It holds no locations, no screen content and nothing people typed: only what kind of problem happened and where, how often, the state of phones and app versions, and sign-in times.')}
      </Notice>
      {error && <Notice tone="red" icon={<TriangleAlert size={18} />} role="alert">{error}</Notice>}
      {message && <Notice tone="green" icon={<Check size={18} />} role="status">{message}</Notice>}

      <div className="kx-grid cols-4 keep-2">
        <Stat icon={<Activity size={22} />} tone={serverOk ? 'green' : 'red'} label={t('حالة الخادم', 'Server')} value={serverOk ? t('سليم', 'Healthy') : t('يحتاج مراجعة', 'Needs a look')} hint={health.database.ok ? t(`قاعدة البيانات ${health.database.latencyMs} م.ث`, `Database ${health.database.latencyMs} ms`) : t('قاعدة البيانات لا تستجيب', 'Database is not answering')} />
        <Stat icon={<Bug size={22} />} tone={counts.openIssues ? 'amber' : 'slate'} label={t('مشكلات مفتوحة', 'Open problems')} value={counts.openIssues} hint={t(`${counts.issues24h} في آخر 24 ساعة`, `${counts.issues24h} in the last 24 hours`)} />
        <Stat icon={<Smartphone size={22} />} tone={counts.phonesWithProblems ? 'amber' : 'slate'} label={t('هواتف تحتاج انتباهاً', 'Phones needing attention')} value={counts.phonesWithProblems} hint={t(`${data.devices.length} هاتف مسجَّل`, `${data.devices.length} reporting`)} />
        <Stat icon={<History size={22} />} tone="blue" label={t('تسجيلات الدخول', 'Sign-ins')} value={counts.signIns24h} hint={t(`${counts.signIns7d} في 7 أيام، ${counts.appSignIns7d} من التطبيق`, `${counts.signIns7d} in 7 days, ${counts.appSignIns7d} from the app`)} />
      </div>

      <Card tone={serverOk ? 'green' : 'red'} icon={<Database size={18} />} title={t('صحة الخادم', 'Server health')} description={t('فحص سريع لقاعدة البيانات والجداول المطلوبة والإعدادات.', 'A quick check of the database, the tables the app needs and the settings.')}
        actions={<button type="button" className="kx-btn is-small" onClick={() => { setLoading(true); void load(); }} disabled={loading}><RefreshCw size={16} />{t('تحديث', 'Refresh')}</button>}>
        <ul className="diag-checks">
          <li><Badge tone={health.database.ok ? 'green' : 'red'} icon={<Database size={14} />}>{health.database.ok ? t('قاعدة البيانات تعمل', 'Database is up') : t('قاعدة البيانات لا تعمل', 'Database is down')}</Badge></li>
          <li>
            <Badge tone={health.schemaMissing.length ? 'red' : 'green'} icon={<Check size={14} />}>{health.schemaMissing.length ? t('تحديث قاعدة البيانات ناقص', 'A database update did not run') : t('جميع الجداول موجودة', 'All tables are in place')}</Badge>
            {health.schemaMissing.length > 0 && <small dir="ltr"> {health.schemaMissing.join(', ')}</small>}
          </li>
          <li><Badge tone={health.environment.mail ? 'green' : 'amber'} icon={<Mail size={14} />}>{health.environment.mail ? t('البريد الإلكتروني مهيّأ', 'E-mail is configured') : t('البريد الإلكتروني غير مهيّأ: لن تصل الدعوات', 'E-mail is not configured: invitations will not arrive')}</Badge></li>
          <li><Badge tone={health.environment.origins ? 'green' : 'amber'} icon={<ShieldCheck size={14} />}>{health.environment.origins ? t('عنوان الموقع الرسمي مضبوط', 'The public address is set') : t('عنوان الموقع الرسمي غير مضبوط', 'The public address is not set')}</Badge></li>
          <li><Badge tone={health.environment.storage ? 'green' : 'amber'} icon={<HardDrive size={14} />}>{health.environment.storage ? t('تخزين الملفات متصل', 'File storage is connected') : t('تخزين الملفات غير متصل: المرفقات والإيصالات لن تُحفظ', 'File storage is not connected: attachments and receipts cannot be saved')}</Badge></li>
        </ul>
      </Card>

      <Card tone="amber" icon={<Bug size={18} />} title={t('المشكلات التي أبلغ عنها الموقع والتطبيق', 'Problems the website and the app reported')} description={t('كل مشكلة تُعدّ مرة واحدة مهما تكررت. عند حلها اختر «تم الحل»؛ وإن عادت ظهرت من جديد.', 'Each problem is counted once however often it happens. Mark it solved when you fix it; if it comes back it reappears.')}
        actions={<label className="kx-check"><input type="checkbox" checked={solved} onChange={(event) => setSolved(event.target.checked)} />{t('إظهار المحلولة', 'Show solved')}</label>}>
        {data.issues.length === 0 ? <Empty icon={<CheckCheck size={20} />}>{t('لا توجد مشكلات مبلَّغ عنها.', 'No problems reported.')}</Empty> : (
          <div className="kx-table-wrap"><table className="kx-table diag-stack">
            <thead><tr><th>{t('المشكلة', 'Problem')}</th><th>{t('أين', 'Where')}</th><th>{t('من', 'Who')}</th><th>{t('المرات', 'Times')}</th><th>{t('آخر مرة', 'Last seen')}</th><th>{t('الإجراء', 'Action')}</th></tr></thead>
            <tbody>{data.issues.map((issue) => (
              <tr key={issue.fingerprint}>
                <td><Badge tone={issue.kind === 'render' || issue.kind === 'api' ? 'red' : 'amber'}>{KINDS[issue.kind]?.[en ? 1 : 0] ?? issue.kind}</Badge> {issue.resolvedAt && <Badge tone="green">{t('تم الحل', 'Solved')}</Badge>}<div dir="ltr" className="diag-message">{issue.message}</div>{issue.detail && <small dir="ltr">{issue.detail}</small>}</td>
                <td dir="ltr" data-label={t('أين', 'Where')}>{issue.route || '—'}</td>
                <td data-label={t('من', 'Who')}>{roleName(issue.role)}<small> · {issue.channel === 'web' ? t('الموقع', 'Website') : `${issue.channel} ${issue.appVersion}`}</small>{issue.platform && <small dir="ltr"> · {issue.platform}</small>}</td>
                <td data-label={t('المرات', 'Times')}>{issue.occurrences}<small> · {t(`${issue.people} مستخدم`, `${issue.people} ${issue.people === 1 ? 'person' : 'people'}`)}</small></td>
                <td data-label={t('آخر مرة', 'Last seen')}>{when(issue.lastSeen)}</td>
                <td data-label={t('الإجراء', 'Action')}><ActionMenu small label={t('إجراءات المشكلة', 'Problem actions')} actions={[
                  {label: t('تم الحل', 'Mark solved'), icon: <Check size={18} />, tone: 'green', hidden: Boolean(issue.resolvedAt), disabled: busy, onSelect: () => { void send('resolve-issue', {fingerprint: issue.fingerprint}); }},
                  {label: t('إعادة الفتح', 'Reopen'), icon: <RotateCcw size={18} />, hidden: !issue.resolvedAt, disabled: busy, onSelect: () => { void send('reopen-issue', {fingerprint: issue.fingerprint}); }},
                  {label: t('حذف', 'Delete'), icon: <Trash2 size={18} />, tone: 'red', disabled: busy, confirm: {message: t('حذف هذه المشكلة من السجل؟', 'Remove this problem from the list?'), yes: t('احذف', 'Delete'), no: t('إلغاء', 'Cancel')}, onSelect: () => { void send('delete-issue', {fingerprint: issue.fingerprint}); }},
                ]} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {counts.solvedIssues > 0 && <div className="kx-btn-row"><ConfirmButton label={t(`حذف المحلولة (${counts.solvedIssues})`, `Clear solved (${counts.solvedIssues})`)} icon={<Trash2 size={16} />} tone="slate" message={t('حذف كل المشكلات المحلولة من السجل؟', 'Remove every solved problem from the list?')} confirmLabel={t('احذف', 'Delete')} cancelLabel={t('إلغاء', 'Cancel')} disabled={busy} onConfirm={() => { void send('clear-solved'); }} /></div>}
      </Card>

      <Card tone="blue" icon={<Smartphone size={18} />} title={t('الهواتف والتطبيقات', 'Phones and apps')} description={t('ما تسمح به هواتف الموظفين وما يلزمه عملهم: الموقع لتسجيل الوصول، والكاميرا للمسح. تُحدَّث كل 12 ساعة أو عند رفض إذن.', 'What the staff phones allow and what their work needs: location for arrivals, the camera for scanning. Updated every 12 hours, or at once when a permission is refused.')}>
        {data.versions.length > 0 && <div className="diag-versions">{data.versions.map((row) => <Badge key={`${row.channel}${row.version}`} tone="slate">{row.channel === 'android' ? 'Android' : 'iOS'} {row.version || '?'} · {row.people}</Badge>)}</div>}
        {attention.length === 0 ? <Empty icon={<Smartphone size={20} />}>{data.devices.length ? t('كل الهواتف المسجَّلة سليمة.', 'Every reporting phone is fine.') : t('لم يرسل أي هاتف حالته بعد. تظهر الهواتف هنا بعد أول دخول من التطبيق أو من صفحة موظف المقصف.', 'No phone has reported yet. Phones appear here after the first sign-in from the app, or on the cafeteria agent page.')}</Empty> : (
          <div className="kx-table-wrap"><table className="kx-table diag-stack">
            <thead><tr><th>{t('الحساب', 'Account')}</th><th>{t('الجهاز', 'Device')}</th><th>{t('الملاحظات', 'Findings')}</th><th>{t('آخر بلاغ', 'Last report')}</th></tr></thead>
            <tbody>{attention.map((device) => (
              <tr key={`${device.role}${device.name}${device.channel}${device.reportedAt}`}>
                <td>{device.name || roleName(device.role)}<small> · {roleName(device.role)}{device.school ? ` · ${device.school}` : ''}</small></td>
                <td dir="ltr" data-label={t('الجهاز', 'Device')}>{device.channel === 'web' ? t('متصفح', 'Browser') : device.channel === 'android' ? 'Android' : 'iOS'} {device.appVersion}<small> {device.osVersion} {device.deviceModel}</small></td>
                <td data-label={t('الملاحظات', 'Findings')}><div className="diag-findings">{device.problems.map((problem) => <Badge key={problem} tone={PROBLEMS[problem].tone}>{PROBLEMS[problem].text[en ? 1 : 0]}</Badge>)}</div></td>
                <td data-label={t('آخر بلاغ', 'Last report')}>{when(device.reportedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card tone="green" icon={<Rocket size={18} />} title={t('إصدارات التطبيق', 'App releases')} description={t('الموقع يتحدّث تلقائياً لكل الهواتف بمجرد نشره. هذه الإعدادات خاصة بنسخة التطبيق نفسها: عند رفع نسخة جديدة إلى المتجر أدخل رقمها هنا فيظهر للمستخدمين شريط «تحديث». ارفع «الحد الأدنى» لإلزام الإصدارات الأقدم بالتحديث قبل المتابعة.', 'The website updates every phone by itself the moment it is published. These settings are for the app build itself: when a new build is in the store, enter its number here and users see an "Update" bar. Raise the "minimum" to make older versions update before they continue.')}>
        <div className="kx-grid cols-2">
          {(['android', 'ios'] as Platform[]).map((platform) => {
            const draft = draftOf(platform);
            const saved = data.releases[platform];
            return (
              <form key={platform} className="diag-release" onSubmit={(event) => { event.preventDefault(); void send('set-release', {platform, ...draft}).then((ok) => { if (ok) { setDrafts((current) => ({...current, [platform]: undefined})); setMessage(t('تم حفظ بيانات الإصدار', 'Release saved')); } }); }}>
                <h4><span dir="ltr">{platform === 'android' ? 'Android' : 'iOS'}{saved ? ` · ${saved.latest}` : ''}</span></h4>
                <div className="kx-form-grid">
                  <label className="kx-field">{t('أحدث إصدار', 'Latest version')}<input className="kx-input" dir="ltr" inputMode="decimal" placeholder="1.2.0" required value={draft.latest} onChange={(event) => edit(platform, {latest: event.target.value})} /></label>
                  <label className="kx-field">{t('أقدم إصدار مسموح', 'Oldest allowed version')}<input className="kx-input" dir="ltr" inputMode="decimal" placeholder="1.0.0" value={draft.minimum} onChange={(event) => edit(platform, {minimum: event.target.value})} /></label>
                  <label className="kx-field">{t('رابط المتجر أو التنزيل', 'Store or download link')}<input className="kx-input" dir="ltr" type="url" placeholder="https://play.google.com/store/apps/details?id=…" value={draft.storeUrl} onChange={(event) => edit(platform, {storeUrl: event.target.value})} /></label>
                  <label className="kx-field">{t('ملاحظة عربية قصيرة', 'Short note (Arabic)')}<input className="kx-input" maxLength={240} value={draft.notesAr} onChange={(event) => edit(platform, {notesAr: event.target.value})} /></label>
                  <label className="kx-field">{t('ملاحظة إنجليزية قصيرة', 'Short note (English)')}<input className="kx-input" dir="ltr" maxLength={240} value={draft.notesEn} onChange={(event) => edit(platform, {notesEn: event.target.value})} /></label>
                </div>
                <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="green" disabled={busy}><Check size={18} />{t('حفظ', 'Save')}</button></div>
              </form>
            );
          })}
        </div>
      </Card>

      <Card tone="slate" icon={<History size={18} />} title={t('آخر تسجيلات الدخول', 'Recent sign-ins')} description={t(`وقت الدخول والدور والمدرسة والقناة فقط، بلا موقع ولا عنوان IP. تُحفظ ${data.stampRetentionDays} يوماً.`, `Time, role, school and channel only: no location, no IP address. Kept ${data.stampRetentionDays} days.`)}
        actions={<select className="kx-select" aria-label={t('تصفية حسب الدور', 'Filter by role')} value={role} onChange={(event) => setRole(event.target.value)}><option value="">{t('كل الأدوار', 'All roles')}</option>{Object.entries(ROLES).map(([value, names]) => <option key={value} value={value}>{names[en ? 1 : 0]}</option>)}</select>}>
        {stampsShown.length === 0 ? <Empty icon={<History size={20} />}>{t('لا توجد تسجيلات دخول في آخر 7 أيام.', 'No sign-ins in the last 7 days.')}</Empty> : (
          <div className="kx-table-wrap"><table className="kx-table diag-stack">
            <thead><tr><th>{t('الوقت', 'Time')}</th><th>{t('الدور', 'Role')}</th><th>{t('الاسم', 'Name')}</th><th>{t('المدرسة', 'School')}</th><th>{t('القناة', 'Channel')}</th></tr></thead>
            <tbody>{stampsShown.map((row) => (
              <tr key={row.id}><td>{when(row.at)}</td><td data-label={t('الدور', 'Role')}>{roleName(row.role)}</td><td data-label={t('الاسم', 'Name')}>{row.name || '—'}</td><td data-label={t('المدرسة', 'School')}>{row.school || '—'}</td><td dir="ltr" data-label={t('القناة', 'Channel')}>{row.channel === 'web' ? t('الموقع', 'Website') : `${row.channel === 'android' ? 'Android' : 'iOS'} ${row.appVersion}`}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
