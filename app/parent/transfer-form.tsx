'use client';
// Step 2 of adding credit: attach the screenshot of the bank transfer. The parent has just made the transfer in the bank's
// own app, so everything here is built for a phone: one big "attach" button that opens the gallery, a preview with a
// remove button, common amounts in one tap, and a big picture is shrunk before it is sent (app/parent/receipt-image.ts).
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Check, ImagePlus, Receipt, X} from 'lucide-react';
import '../ui/kx.css';
import {Notice} from '../ui/kx';
import {prepareReceipt, RECEIPT_TYPES, sizeLabel} from './receipt-image';

const AMOUNTS = [20, 50, 100, 200, 500];

export default function TransferForm({language, cafeteriaId, studentId, disabled, onSent}: {language: 'ar' | 'en'; cafeteriaId: string; studentId: string; disabled: boolean; onSent: () => void}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const [amount, setAmount] = useState('50');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // A preview address must be released when it is replaced or the form goes away.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(chosen: File | undefined) {
    setError('');
    setSent(false);
    if (!chosen) return;
    setWorking(true);
    const prepared = await prepareReceipt(chosen);
    setWorking(false);
    if (!prepared.ok) {
      setFile(null);
      setPreview('');
      setError(prepared.reason === 'type' ? t('الصيغ المدعومة: صورة (PNG / JPG / WebP) أو PDF', 'Supported: an image (PNG / JPG / WebP) or a PDF') : t('الملف كبير جداً (الحد 4 ميجابايت). التقط لقطة شاشة بدلاً من صورة الورقة.', 'The file is too large (4 MB at most). Take a screenshot instead of a photo.'));
      return;
    }
    setFile(prepared.file);
    setPreview(prepared.file.type.startsWith('image/') ? URL.createObjectURL(prepared.file) : '');
  }
  function clear() {
    setFile(null);
    setPreview('');
    if (picker.current) picker.current.value = '';
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      const form = new FormData();
      form.append('cafeteriaId', cafeteriaId);
      form.append('studentId', studentId);
      form.append('amount', amount);
      form.append('reference', reference);
      form.append('file', file);
      const response = await fetch('/api/fushati/receipts', {method: 'POST', body: form});
      const body = (await response.json().catch(() => ({}))) as {error?: string};
      if (!response.ok) throw new Error(body.error || t('تعذر تسجيل الحوالة', 'The transfer could not be recorded'));
      setSent(true);
      setFile(null);
      setPreview('');
      setReference('');
      if (picker.current) picker.current.value = '';
      onSent();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('تعذر تسجيل الحوالة', 'The transfer could not be recorded'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="kx-grid fsp-transfer" onSubmit={submit}>
      {sent && <Notice tone="green" icon={<Check size={18} />} role="status">{t('وصلنا الإيصال. سيُضاف الرصيد بعد أن يتحقق مدير المقصف من التحويل في البنك.', 'Receipt received. The credit is added once the cafeteria administrator checks the transfer at the bank.')}</Notice>}
      {error && <Notice tone="red" icon={<X size={18} />} role="alert">{error}</Notice>}

      <div className="fsp-attach">
        <input ref={picker} id="fsp-receipt-file" className="fsp-attach-input" type="file" accept={RECEIPT_TYPES.join(',')} disabled={disabled || working} onChange={(event) => void pick(event.target.files?.[0])} />
        {file ? (
          <div className="fsp-attached">
            {preview ? <img src={preview} alt={t('معاينة إيصال التحويل', 'Preview of the transfer receipt')} /> : <span className="fsp-attached-pdf"><Receipt size={28} /></span>}
            <span className="fsp-attached-info"><strong dir="ltr">{file.name}</strong><small dir="ltr">{sizeLabel(file.size)}</small></span>
            <button type="button" className="kx-btn is-small" onClick={clear} disabled={working}><X size={16} />{t('إزالة', 'Remove')}</button>
          </div>
        ) : (
          <label htmlFor="fsp-receipt-file" className="fsp-attach-button" data-disabled={disabled || working ? '1' : undefined}>
            <ImagePlus size={26} />
            <strong>{working ? t('جارٍ تجهيز الصورة…', 'Preparing the picture…') : t('إرفاق لقطة شاشة التحويل', 'Attach the transfer screenshot')}</strong>
            <small>{t('اختر الصورة من المعرض أو الملفات', 'Pick it from your gallery or files')} <bdi dir="ltr">(PNG / JPG / PDF)</bdi></small>
          </label>
        )}
      </div>

      <div className="fsp-amounts" role="group" aria-label={t('مبالغ شائعة', 'Common amounts')}>
        {AMOUNTS.map((preset) => <button key={preset} type="button" className="fsp-chip" aria-pressed={amount === String(preset)} disabled={disabled} onClick={() => setAmount(String(preset))}>{preset}</button>)}
      </div>
      <div className="kx-form-grid">
        <label className="kx-field">{t('المبلغ المحوّل (ر.س)', 'Transfer amount (SAR)')}<input className="kx-input" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={disabled} /></label>
        <label className="kx-field">{t('رقم المرجع البنكي', 'Bank reference number')}<input className="kx-input" autoComplete="off" value={reference} onChange={(event) => setReference(event.target.value)} minLength={5} maxLength={80} required disabled={disabled} /><small>{t('يظهر في شاشة نجاح التحويل في تطبيق البنك (5 خانات فأكثر)', 'Shown on the transfer-complete screen of your bank app (5 characters or more)')}</small></label>
      </div>
      <div className="kx-btn-row"><button className="kx-btn is-solid fsp-send" data-tone="green" disabled={disabled || working || !file}><Check size={18} />{working ? t('جارٍ الإرسال…', 'Sending…') : t('رفع الإيصال للمراجعة', 'Submit receipt for approval')}</button></div>
    </form>
  );
}
