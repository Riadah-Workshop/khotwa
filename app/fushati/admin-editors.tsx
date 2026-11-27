'use client';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {Building2, Check, Users, X} from 'lucide-react';
import '../ui/kx.css';
import './panels.css';
import {ConfirmButton, EditorView, Notice} from '../ui/kx';

export type CafeRow = {id: string; school_name: string; name: string; alias: string; bank_name: string; iban: string; beneficiary: string; active: number};
export type StaffRow = {id: string; role: string; full_name: string; phone: string; login_identifier: string; email: string};
export type Assignment = {user_id: string; cafeteria_id: string; permissions: string[]};
type Submit = (op: string, payload: unknown) => Promise<boolean>;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

/**
 * Changing a cafeteria's name, bank details or short alias: a screen of its own where the whole form is filled in and
 * saved once. Only the system administrator may change the name and bank details; a cafeteria administrator changes
 * the alias only.
 */
export function CafeteriaEditor({language, cafe, isMain, busy, error, submit, onBack}: {language: 'ar' | 'en'; cafe: CafeRow; isMain: boolean; busy: boolean; error: string; submit: Submit; onBack: () => void}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const start = {name: cafe.name, bank: cafe.bank_name || '', iban: cafe.iban || '', beneficiary: cafe.beneficiary || '', alias: cafe.alias || ''};
  const [form, setForm] = useState(start);
  const [original] = useState(JSON.stringify(start));
  const set = (patch: Partial<typeof start>) => setForm({...form, ...patch});

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    let ok = true;
    const details = isMain && (form.name !== start.name || form.bank !== start.bank || form.iban !== start.iban || form.beneficiary !== start.beneficiary);
    if (details) ok = await submit('edit-cafeteria', {id: cafe.id, name: form.name.trim(), bankName: form.bank.trim(), iban: form.iban.trim(), beneficiary: form.beneficiary.trim()});
    if (ok && form.alias !== start.alias) ok = await submit('set-alias', {id: cafe.id, alias: form.alias.trim()});
    if (ok) onBack();
  }

  return <EditorView
    title={t('تعديل المقصف', 'Edit cafeteria')}
    description={`${cafe.school_name} — ${cafe.name}`}
    icon={<Building2 size={26}/>} tone="green" tourId="cfa-cafeteria-form"
    onBack={onBack} backLabel={t('رجوع إلى المقاصف', 'Back to cafeterias')}
    dirty={JSON.stringify(form) !== original} dirtyMessage={t('لم تحفظ التعديلات. هل تتجاهلها وتخرج؟', 'You have unsaved changes. Discard them and leave?')}
    keepLabel={t('متابعة التعديل', 'Keep editing')} discardLabel={t('تجاهل والخروج', 'Discard and leave')}
    actions={<>
      <button type="submit" form="cfe-form" className="kx-btn is-solid" disabled={busy}><Check size={18} aria-hidden="true"/>{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}</button>
      <button type="button" className="kx-btn" disabled={busy} onClick={onBack}>{t('إلغاء', 'Cancel')}</button>
    </>}>
    <form id="cfe-form" onSubmit={save} className="cfm-form">
      {error && <div className="cfm-wide"><Notice tone="red" role="alert">{error}</Notice></div>}
      {isMain
        ? <>
          <label className="kx-field cfm-wide"><span>{t('اسم المقصف', 'Cafeteria name')}</span><input className="kx-input" required minLength={2} autoFocus value={form.name} onChange={(event) => set({name: event.target.value})}/></label>
          <label className="kx-field"><span>{t('اسم البنك', 'Bank name')}</span><input className="kx-input" value={form.bank} onChange={(event) => set({bank: event.target.value})}/></label>
          <label className="kx-field"><span>{t('المستفيد', 'Beneficiary')}</span><input className="kx-input" value={form.beneficiary} onChange={(event) => set({beneficiary: event.target.value})}/></label>
          <label className="kx-field cfm-wide"><span>{t('IBAN سعودي (24 خانة)', 'Saudi IBAN (24 characters)')}</span><input className="kx-input" dir="ltr" value={form.iban} onChange={(event) => set({iban: event.target.value.toUpperCase().replace(/\s/g, '')})} placeholder="SA0000000000000000000000"/></label>
        </>
        : <Notice tone="slate" title={t('بيانات المقصف', 'Cafeteria details')}>{t('اسم المقصف والمدرسة وبيانات البنك يعدلها مدير نظام خطوة. يمكنك إضافة اسم مختصر للتمييز بين مقاصفك.', 'The cafeteria name, school and bank details are managed by the system administrator. You can add a short alias to tell your cafeterias apart.')}</Notice>}
      <label className="kx-field cfm-wide"><span>{t('الاسم المختصر (اختياري)', 'Short alias (optional)')}</span>
        <input className="kx-input" maxLength={60} autoFocus={!isMain} value={form.alias} onChange={(event) => set({alias: event.target.value})}/>
        <small className="cfi-hint">{t('يظهر بجانب اسم المقصف في القوائم. اتركه فارغاً لحذفه.', 'Shown next to the cafeteria name in lists. Leave it empty to remove it.')}</small>
      </label>
    </form>
  </EditorView>;
}

/**
 * Changing a staff member's name, phone, cafeterias and permissions: one screen, one Save. Only the fields that were
 * changed are sent, because a cafeteria administrator may change some of them only for agents who work in his
 * cafeterias alone.
 */
export function StaffEditor({language, user, cafeterias, assignments, permissionLabels, cafeName, busy, error, submit, onBack}: {
  language: 'ar' | 'en'; user: StaffRow; cafeterias: CafeRow[]; assignments: Assignment[]; permissionLabels: [string, string, string][];
  cafeName: (cafe: {name: string; alias?: string}) => string; busy: boolean; error: string; submit: Submit; onBack: () => void;
}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const isAgent = user.role === 'fushati_agent';
  const mine = assignments.filter((assignment) => assignment.user_id === user.id);
  const start = {
    fullName: user.full_name, phone: user.phone || '',
    cafeteriaIds: mine.map((assignment) => assignment.cafeteria_id),
    permissions: permissionLabels.filter(([key]) => mine.some((assignment) => assignment.permissions.includes(key))).map(([key]) => key),
  };
  const [form, setForm] = useState(start);
  const [original] = useState(JSON.stringify(start));
  const [problem, setProblem] = useState('');
  const toggle = (list: string[], value: string, on: boolean) => (on ? (list.includes(value) ? list : list.concat([value])) : list.filter((entry) => entry !== value));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (form.fullName.trim().length < 2) { setProblem(t('اكتب اسم الموظف (حرفان على الأقل).', 'Enter the staff member’s name (at least 2 letters).')); return; }
    if (isAgent && !form.cafeteriaIds.length) { setProblem(t('اختر مقصفاً واحداً على الأقل.', 'Choose at least one cafeteria.')); return; }
    setProblem('');
    const payload: Record<string, unknown> = {id: user.id};
    if (form.fullName.trim() !== start.fullName) payload.fullName = form.fullName.trim();
    if (form.phone.trim() !== start.phone) payload.phone = form.phone.trim();
    if (!sameSet(form.cafeteriaIds, start.cafeteriaIds)) payload.cafeteriaIds = form.cafeteriaIds;
    if (isAgent && !sameSet(form.permissions, start.permissions)) payload.permissions = form.permissions;
    if (Object.keys(payload).length === 1) { onBack(); return; }
    if (await submit('edit-user', payload)) onBack();
  }

  return <EditorView
    title={t('تعديل الموظف', 'Edit staff member')}
    description={`${user.full_name} — ${user.role === 'fushati_admin' ? t('مدير فسحتي', 'Fushati administrator') : t('موظف مقصف', 'Cafeteria agent')}`}
    icon={<Users size={26}/>} tone="violet" tourId="cfa-staff-form"
    onBack={onBack} backLabel={t('رجوع إلى الموظفين', 'Back to staff')}
    dirty={JSON.stringify(form) !== original} dirtyMessage={t('لم تحفظ التعديلات. هل تتجاهلها وتخرج؟', 'You have unsaved changes. Discard them and leave?')}
    keepLabel={t('متابعة التعديل', 'Keep editing')} discardLabel={t('تجاهل والخروج', 'Discard and leave')}
    actions={<>
      <button type="submit" form="cfu-form" className="kx-btn is-solid" disabled={busy}><Check size={18} aria-hidden="true"/>{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}</button>
      <button type="button" className="kx-btn" disabled={busy} onClick={onBack}>{t('إلغاء', 'Cancel')}</button>
    </>}>
    <form id="cfu-form" onSubmit={save} className="cfm-form">
      {(problem || error) && <div className="cfm-wide"><Notice tone="red" role="alert">{problem || error}</Notice></div>}
      <label className="kx-field"><span>{t('الاسم', 'Name')}</span><input className="kx-input" required minLength={2} autoFocus value={form.fullName} onChange={(event) => setForm({...form, fullName: event.target.value})}/></label>
      <label className="kx-field"><span>{t('رقم جوال للتواصل (اختياري)', 'Contact phone (optional)')}</span><input className="kx-input" dir="ltr" inputMode="tel" value={form.phone} placeholder="05xxxxxxxx" onChange={(event) => setForm({...form, phone: event.target.value})}/></label>
      <fieldset className="cfm-wide cfm-checks"><legend>{t('المقاصف التي يعمل بها', 'Cafeterias he works in')}</legend>
        {cafeterias.filter((cafe) => cafe.active || form.cafeteriaIds.includes(cafe.id)).map((cafe) => <label key={cafe.id}>
          <input type="checkbox" checked={form.cafeteriaIds.includes(cafe.id)} onChange={(event) => setForm({...form, cafeteriaIds: toggle(form.cafeteriaIds, cafe.id, event.target.checked)})}/>
          <span>{cafe.school_name} — {cafeName(cafe)}</span>
        </label>)}
      </fieldset>
      {isAgent && <fieldset className="cfm-wide cfm-checks"><legend>{t('ما يسمح له بفعله', 'What he may do')}</legend>
        {permissionLabels.map(([key, ar, en]) => <label key={key}>
          <input type="checkbox" checked={form.permissions.includes(key)} onChange={(event) => setForm({...form, permissions: toggle(form.permissions, key, event.target.checked)})}/>
          <span>{t(ar, en)}</span>
        </label>)}
      </fieldset>}
    </form>
  </EditorView>;
}

/** Approve (after a Yes/No in place) or reject (with the reason typed in place) one bank transfer. */
export function TransferActions({language, busy, onApprove, onReject}: {language: 'ar' | 'en'; busy: boolean; onApprove: () => void; onReject: (note: string) => void}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  if (rejecting) return <span className="kx-confirm is-wide" role="group" aria-label={t('رفض الحوالة', 'Reject the transfer')}>
    <label className="cft-reason"><span>{t('سبب الرفض (اختياري)', 'Reason for rejection (optional)')}</span>
      <input className="kx-input" autoFocus maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}/></label>
    <button type="button" className="kx-btn is-small is-solid" data-tone="red" disabled={busy} onClick={() => { onReject(note.trim()); setRejecting(false); setNote(''); }}><X size={15} aria-hidden="true"/>{t('تأكيد الرفض', 'Confirm rejection')}</button>
    <button type="button" className="kx-btn is-small" onClick={() => setRejecting(false)}>{t('إلغاء', 'Cancel')}</button>
  </span>;
  return <span className="cft-actions">
    <ConfirmButton tone="green" solid label={t('اعتماد', 'Approve')} icon={<Check size={15} aria-hidden="true"/>} disabled={busy}
      message={t('هل تحققت من وصول الحوالة إلى البنك؟', 'Have you verified the transfer in the bank account?')}
      confirmLabel={t('نعم، اعتمد', 'Yes, approve')} cancelLabel={t('لا', 'No')} onConfirm={onApprove}/>
    <button type="button" className="kx-btn is-small is-soft" data-tone="red" disabled={busy} onClick={() => setRejecting(true)}><X size={15} aria-hidden="true"/>{t('رفض', 'Reject')}</button>
  </span>;
}
