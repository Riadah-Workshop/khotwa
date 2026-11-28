'use client';
import {useCallback, useEffect, useState} from 'react';
import {Check, Clock, Copy, Landmark, Plus, Receipt, RefreshCcw, ScanLine, Settings, ShoppingBasket, TrendingUp, Wallet, X, Printer, ShieldCheck} from 'lucide-react';
import '../ui/kx.css';
import './fushati-parent.css';
import {Badge, Card, Chip, ConfirmButton, Empty, Notice, Stat, TabPanel, Tabs} from '../ui/kx';
import type {Tone} from '../ui/kx';
import QuickLimit from './quick-limit';
import TransferForm from './transfer-form';

type Cafe = {id: string; name: string; bank_name: string; iban: string; beneficiary: string; active: number};
type FushatiRecord = {schoolId: string; schoolName: string; studentId: string; studentName: string; grade: string; cafeteria: Cafe; balanceMinor: number; dailyLimitMinor: number; monthlyLimitMinor: number; allowedItemIds: string[]; active: number; todaySpentMinor: number; monthSpentMinor: number};
type Item = {id: string; name: string; category: string; price_minor: number};
type Ledger = {entry_type: string; description: string; amount_minor: number; created_at: string};
type Transfer = {id: string; amount_minor: number; status: string; bank_reference: string; review_note: string; created_at: string};
type Alert = {id: string; day_key: string; detail: string; created_at: string};

export type CafeteriaView = 'topup' | 'statement' | 'rules' | 'card';
export const CAFETERIA_VIEWS: CafeteriaView[] = ['topup', 'statement', 'rules', 'card'];

const money = (minor: number, language: 'ar' | 'en') => {
  const value = (minor / 100).toFixed(2);
  return language === 'en' ? `SAR ${value}` : `${value} ر.س`;
};
const TRANSFER_TONE: Record<string, Tone> = {pending: 'amber', approved: 'green', rejected: 'red'};

export default function FushatiParent({schoolId, studentId, language = 'ar', studentName = '', schoolName = '', view, onViewChange}: {schoolId: string; studentId: string; language?: 'ar' | 'en'; studentName?: string; schoolName?: string; view: CafeteriaView; onViewChange: (view: CafeteriaView) => void}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const locale = language === 'en' ? 'en-GB' : 'ar-SA';
  const [records, setRecords] = useState<FushatiRecord[]>([]);
  const [cafeteriaId, setCafeteriaId] = useState('');
  const [menu, setMenu] = useState<Item[]>([]);
  const [history, setHistory] = useState<{ledger: Ledger[]; transfers: Transfer[]; alerts: Alert[]}>({ledger: [], transfers: [], alerts: []});
  const [allowed, setAllowed] = useState<string[]>([]);
  const [daily, setDaily] = useState('3');
  const [monthly, setMonthly] = useState('0');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrImage, setQrImage] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/fushati?op=bootstrap', {cache: 'no-store'});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const list = ((v.students || []) as FushatiRecord[]).filter(x => x.schoolId === schoolId && x.studentId === studentId);
      setRecords(list);
      setCafeteriaId(previous => (list.some(x => x.cafeteria.id === previous) ? previous : list[0]?.cafeteria.id || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل فسحتي');
    }
  }, [schoolId, studentId]);
  useEffect(() => { load(); }, [load]);

  const record = records.find(x => x.cafeteria.id === cafeteriaId);
  const loadDetails = useCallback(async () => {
    if (!cafeteriaId) return;
    try {
      const params = `cafeteriaId=${encodeURIComponent(cafeteriaId)}&studentId=${encodeURIComponent(studentId)}`;
      const [m, h] = await Promise.all([fetch('/api/fushati?op=menu&' + params, {cache: 'no-store'}), fetch('/api/fushati?op=history&' + params, {cache: 'no-store'})]);
      const menuBody = await m.json();
      const historyBody = await h.json();
      if (!m.ok || !h.ok) throw new Error(menuBody.error || historyBody.error || 'تعذر التحميل');
      setMenu(menuBody.menu || []);
      setHistory(historyBody);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر عرض التفاصيل');
    }
  }, [cafeteriaId, studentId]);
  useEffect(() => { loadDetails(); setQrImage(''); }, [loadDetails]);
  useEffect(() => {
    if (record) {
      setAllowed(record.allowedItemIds || []);
      setDaily(String(record.dailyLimitMinor / 100));
      setMonthly(String(record.monthlyLimitMinor / 100));
      setActive(!!record.active);
    }
  }, [record?.cafeteria.id, record?.dailyLimitMinor, record?.monthlyLimitMinor, record?.active, JSON.stringify(record?.allowedItemIds)]);

  async function post(op: string, data: unknown) {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/fushati', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op, data})});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setNotice(t('تم حفظ الإعدادات بنجاح', 'Settings saved successfully'));
      await load();
      await loadDetails();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }
  async function generateQr() {
    if (!record) return;
    try {
      setError('');
      const r = await fetch(`/api/fushati?op=qr&cafeteriaId=${record.cafeteria.id}&studentId=${studentId}`, {cache: 'no-store'});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const QRCode = (await import('qrcode')).default;
      setQrImage(await QRCode.toDataURL(v.token, {margin: 2, width: 260, errorCorrectionLevel: 'M'}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إصدار QR');
    }
  }
  async function rotateCard() {
    if (!record) return;
    await post('rotate-card', {cafeteriaId: record.cafeteria.id, studentId});
    setQrImage('');
  }
  // The quick change at the school gate: the daily limit only (see app/parent/quick-limit.tsx).
  async function saveDaily(dailyLimit: string) {
    if (!record) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/fushati', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'set-daily-limit', data: {cafeteriaId: record.cafeteria.id, studentId, dailyLimit}})});
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const now = money(v.dailyLimitMinor, language);
      setNotice(t(`الحد اليومي الآن ${now}`, `The daily limit is now ${now}`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر الحفظ', 'Could not save'));
    } finally {
      setBusy(false);
    }
  }
  async function copyIban(iban: string) {
    try {
      await navigator.clipboard.writeText(iban);
      setNotice(t('تم نسخ رقم الآيبان', 'IBAN copied'));
    } catch {
      setError(t('تعذر النسخ، انسخ الرقم يدوياً', 'Could not copy; please copy the number by hand'));
    }
  }

  const pendingCount = history.transfers.filter(x => x.status === 'pending').length;
  const transferLabel: Record<string, string> = {
    pending: t('بانتظار مراجعة البنك', 'Awaiting bank verification'),
    approved: t('معتمدة', 'Approved'),
    rejected: t('مرفوضة', 'Rejected'),
  };
  const notSet = t('لم يحدد بعد', 'Not set yet');

  return <section className="fsp-root" aria-label={t('مقصف فسحتي', 'Fushati cafeteria')}>
    {error && <Notice tone="red" icon={<X size={18}/>} role="alert">{error}</Notice>}
    {notice && <Notice tone="green" icon={<Check size={18}/>} role="status">{notice}</Notice>}
    {!records.length
      ? <Card icon={<ShoppingBasket size={18}/>} tone="amber" title={t('فسحتي', 'Fushati')}><Empty icon={<ShoppingBasket size={24}/>}>{t('لم يتم تفعيل مقصف فسحتي لهذه المدرسة بعد.', 'Fushati is not available at this school yet.')}</Empty></Card>
      : <>
        {records.length > 1 && <label className="kx-field">{t('اختر المقصف', 'Select cafeteria')}
          <select className="kx-select" value={cafeteriaId} onChange={e => setCafeteriaId(e.target.value)}>{records.map(r => <option key={r.cafeteria.id} value={r.cafeteria.id}>{r.cafeteria.name}</option>)}</select>
        </label>}
        {record && <>
          {history.alerts?.length > 0 && <Notice tone="red" icon={<ShieldCheck size={18}/>} title={t('تنبيهات استخدام بطاقة الطالب', 'Student card use alerts')} role="alert">
            {history.alerts.map(alert => <span key={alert.id} style={{display: 'block'}}>{t('تم رفض محاولة شراء بالبطاقة يوم ', 'A purchase attempt was declined on ')}{alert.day_key}{t(' لأن سجل الحضور يظهر غياب الطالب. يرجى التأكد من البطاقة مع المدرسة.', ' because school attendance marked the student absent. Please verify the card with the school.')}</span>)}
          </Notice>}
          {!record.cafeteria.active && <Notice tone="amber" icon={<Clock size={18}/>}>{t('هذا المقصف موقوف حالياً. السجل والرصيد متاحان للمراجعة فقط.', 'This cafeteria is disabled. History and balances remain visible for review.')}</Notice>}

          <div className="kx-grid cols-4 keep-2" data-tour="fsp-balance">
            <Stat icon={<Wallet size={22}/>} tone="green" label={t('الرصيد الحالي', 'Current balance')} value={money(record.balanceMinor, language)} hint={record.cafeteria.name}/>
            <Stat icon={<ShoppingBasket size={22}/>} tone="amber" label={t('المصروف اليوم', 'Spent today')} value={money(record.todaySpentMinor, language)} hint={t('الحد اليومي: ', 'Daily limit: ') + money(record.dailyLimitMinor, language)}/>
            <Stat icon={<TrendingUp size={22}/>} tone="blue" label={t('مصروف هذا الشهر', 'Spent this month')} value={money(record.monthSpentMinor || 0, language)} hint={record.monthlyLimitMinor ? t('الحد الشهري: ', 'Monthly limit: ') + money(record.monthlyLimitMinor, language) : t('بدون حد شهري', 'No monthly limit')}/>
            <Stat icon={<Receipt size={22}/>} tone={pendingCount ? 'violet' : 'slate'} label={t('حوالات قيد المراجعة', 'Transfers in review')} value={pendingCount} hint={pendingCount ? t('بانتظار تحقق المقصف', 'Waiting for the cafeteria') : t('لا شيء معلّق', 'Nothing pending')}/>
          </div>

          <QuickLimit key={`${record.cafeteria.id}:${record.dailyLimitMinor}`} language={language} studentName={studentName || record.studentName} currentMinor={record.dailyLimitMinor} spentTodayMinor={record.todaySpentMinor} busy={busy} disabled={!record.cafeteria.active} onSave={saveDaily}/>

          <Tabs idPrefix="fsp" label={t('أقسام المقصف', 'Cafeteria sections')} value={view} onChange={id => onViewChange(id as CafeteriaView)} rtl={language === 'ar'} tourId="fsp-tabs" items={[
            {id: 'topup', label: t('شحن الرصيد', 'Add credit'), icon: <Receipt size={18}/>, tone: 'blue'},
            {id: 'statement', label: t('كشف الحساب', 'Statement'), icon: <RefreshCcw size={18}/>, tone: 'slate', badge: pendingCount},
            {id: 'rules', label: t('حدود المصروف', 'Spending rules'), icon: <Settings size={18}/>, tone: 'violet'},
            {id: 'card', label: t('بطاقة الطالب', 'Student card'), icon: <ScanLine size={18}/>, tone: 'teal'},
          ]}/>

          <TabPanel idPrefix="fsp" id="topup" active={view === 'topup'}>
            <div className="kx-grid cols-2">
              <Card tourId="fsp-topup" tone="blue" icon={<Landmark size={18}/>} title={t('1. حوّل المبلغ إلى حساب المقصف', '1. Transfer to the cafeteria account')} description={t('حوّل من تطبيق بنكك ثم ارفع الإيصال في الخطوة التالية.', 'Transfer from your banking app, then upload the receipt in the next step.')}>
                <dl className="fsp-bank">
                  <div><dt>{t('البنك', 'Bank')}</dt><dd>{record.cafeteria.bank_name || notSet}</dd></div>
                  <div><dt>{t('المستفيد', 'Beneficiary')}</dt><dd>{record.cafeteria.beneficiary || notSet}</dd></div>
                  <div><dt>IBAN</dt><dd dir="ltr">{record.cafeteria.iban || notSet}</dd></div>
                </dl>
                {record.cafeteria.iban && <div className="kx-btn-row"><button type="button" className="kx-btn is-soft" data-tone="blue" onClick={() => copyIban(record.cafeteria.iban)}><Copy size={17}/>{t('نسخ رقم الآيبان', 'Copy IBAN')}</button></div>}
                <Notice tone="slate" icon={<ShieldCheck size={18}/>}>{t('لا توجد مدفوعات داخل التطبيق: التحويل يتم مباشرة إلى بنك المقصف.', 'No payments are made inside the app: the transfer goes straight to the cafeteria bank.')}</Notice>
              </Card>
              <Card tone="green" icon={<Receipt size={18}/>} title={t('2. ارفع إيصال التحويل', '2. Upload the transfer receipt')} description={t('يضاف الرصيد بعد أن يتحقق مدير المقصف من التحويل.', 'Credit is added once the cafeteria administrator verifies the transfer.')}>
                <TransferForm language={language} cafeteriaId={record.cafeteria.id} studentId={studentId} disabled={!record.cafeteria.iban || !record.cafeteria.active} onSent={() => { void loadDetails(); }}/>
              </Card>
            </div>
          </TabPanel>

          <TabPanel idPrefix="fsp" id="statement" active={view === 'statement'}>
            <div className="kx-grid cols-2" data-tour="fsp-statement">
              <Card tone="slate" icon={<RefreshCcw size={18}/>} title={t('السجل المالي', 'Financial history')} description={t('عمليات الشراء والشحن على حساب الطالب.', 'Purchases and top-ups on the student account.')}>
                {history.ledger.length ? <ul className="kx-list">{history.ledger.map((entry, i) => <li key={i}>
                  <span className="fsp-row"><Chip tone={entry.amount_minor > 0 ? 'green' : 'amber'} size="small" icon={entry.amount_minor > 0 ? <Plus size={16}/> : <ShoppingBasket size={16}/>}/><span>{entry.description}<small className="fsp-sub">{new Date(entry.created_at).toLocaleString(locale)}</small></span></span>
                  <strong className="fsp-amount" data-sign={entry.amount_minor > 0 ? 'plus' : 'minus'} dir="ltr">{entry.amount_minor > 0 ? '+' : entry.amount_minor < 0 ? '−' : ''}{money(Math.abs(entry.amount_minor), language)}</strong>
                </li>)}</ul> : <Empty icon={<RefreshCcw size={24}/>}>{t('لا توجد عمليات شحن أو شراء بعد.', 'No transactions recorded yet.')}</Empty>}
              </Card>
              <Card tone="blue" icon={<Receipt size={18}/>} title={t('الحوالات', 'Transfers')} description={t('حالة كل إيصال رفعته.', 'The state of every receipt you uploaded.')}>
                {history.transfers.length ? <ul className="kx-list">{history.transfers.map(row => <li key={row.id}>
                  <span><Badge tone={TRANSFER_TONE[row.status] || 'slate'} icon={row.status === 'approved' ? <Check size={13}/> : row.status === 'rejected' ? <X size={13}/> : <Clock size={13}/>}>{transferLabel[row.status] || row.status}</Badge>
                    <small className="fsp-sub">{t('رقم المرجع:', 'Reference:')} {row.bank_reference}{row.review_note ? ' · ' + row.review_note : ''}</small></span>
                  <span className="fsp-row"><strong dir="ltr">{money(row.amount_minor, language)}</strong><a className="kx-btn is-small" href={'/api/fushati/receipts?id=' + encodeURIComponent(row.id)}>{t('الإيصال', 'Receipt')}</a></span>
                </li>)}</ul> : <Empty icon={<Receipt size={24}/>}>{t('لا توجد حوالات.', 'No transfers found.')}</Empty>}
              </Card>
            </div>
          </TabPanel>

          <TabPanel idPrefix="fsp" id="rules" active={view === 'rules'}>
            <Card tourId="fsp-rules" tone="violet" icon={<Settings size={18}/>} title={t('إدارة مصروف الطالب', 'Manage student allowance')} description={t('حدود الصرف والمنتجات المسموحة.', 'Spending limits and allowed products.')}>
              <form className="kx-grid" onSubmit={e => { e.preventDefault(); post('settings', {cafeteriaId, studentId, dailyLimit: daily, monthlyLimit: monthly, allowedItemIds: allowed, active}); }}>
                <div className="kx-form-grid">
                  <label className="kx-field">{t('الحد اليومي (ر.س)', 'Daily limit (SAR)')}<input className="kx-input" inputMode="decimal" value={daily} onChange={e => setDaily(e.target.value)}/></label>
                  <label className="kx-field">{t('الحد الشهري (ر.س)', 'Monthly limit (SAR)')}<input className="kx-input" inputMode="decimal" value={monthly} onChange={e => setMonthly(e.target.value)}/><small>{t('0 تعني بدون حد', '0 means no limit')}</small></label>
                </div>
                <label className="kx-check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>{t('السماح بالشراء', 'Allow purchases')}</label>
                <div>
                  <strong>{t('المنتجات المسموحة', 'Allowed products')}</strong>
                  <p className="fsp-help">{allowed.length ? t(`${allowed.length} منتج محدد، وغيرها غير مسموح.`, `${allowed.length} selected; everything else is blocked.`) : t('لم تحدد أي منتج، لذلك جميع المنتجات مسموحة.', 'Nothing selected, so every product is allowed.')}</p>
                  <div className="fsp-products">{menu.map(m => <label key={m.id} className="kx-check fsp-product"><input type="checkbox" checked={allowed.includes(m.id)} onChange={e => setAllowed(e.target.checked ? [...allowed, m.id] : allowed.filter(a => a !== m.id))}/><span>{m.name}</span><Badge tone="slate">{money(m.price_minor, language)}</Badge></label>)}</div>
                </div>
                <div className="kx-btn-row"><button className="kx-btn is-solid" data-tone="violet" disabled={busy || !record.cafeteria.active}><Check size={18}/>{t('حفظ الحدود والخيارات', 'Save spending rules')}</button></div>
              </form>
            </Card>
          </TabPanel>

          <TabPanel idPrefix="fsp" id="card" active={view === 'card'}>
            <Card tourId="fsp-card" tone="teal" icon={<ScanLine size={18}/>} title={t('رمز الطالب للمقصف', 'Student cafeteria card')} description={t('رمز QR دائم يمكن طباعته كالبطاقة المدرسية.', 'A permanent QR code that can be printed as a school card.')}>
              <p className="fsp-help">{t('إذا فُقدت البطاقة، ألغها وأصدر أخرى، فتتوقف البطاقة القديمة عن العمل فوراً.', 'If the card is lost, cancel it and issue a new one; the old card stops working immediately.')}</p>
              <div className="kx-btn-row">
                <button type="button" className="kx-btn is-solid" data-tone="teal" onClick={generateQr} disabled={busy || !record.cafeteria.active}><ScanLine size={18}/>{t('عرض البطاقة الدائمة', 'Show permanent card')}</button>
                <ConfirmButton tone="red" small={false} label={t('إلغاء بطاقة مفقودة', 'Revoke lost card')} icon={<X size={18}/>} disabled={busy}
                  message={t('هل فُقدت البطاقة؟ سيتم إلغاء البطاقة المطبوعة السابقة نهائياً.', 'Lost card? This permanently invalidates the previous printed card.')}
                  confirmLabel={t('نعم، إلغاء البطاقة', 'Yes, revoke it')} cancelLabel={t('لا', 'No')} onConfirm={rotateCard}/>
              </div>
              {qrImage && <div className="fsp-qr">
                <div className="fsp-print-card"><strong>{t('خطوة × فسحتي | Khotwa × Fushati', 'Khotwa × Fushati')}</strong><p><b>{studentName || record.studentName}</b></p><p>{schoolName || record.schoolName} — {record.cafeteria.name}</p><img alt={t('رمز بطاقة الطالب للمقصف', 'Student cafeteria card code')} src={qrImage} width="260" height="260"/><small>{t('بطاقة طالب دائمة — هذا الرمز يخص الطالب والمقصف فقط', 'Permanent student card — valid at this cafeteria only')}</small></div>
                <button type="button" className="kx-btn fsp-print-button" onClick={() => window.print()}><Printer size={18}/>{t('طباعة بطاقة الطالب', 'Print student card')}</button>
              </div>}
            </Card>
          </TabPanel>
        </>}
      </>}
  </section>;
}
