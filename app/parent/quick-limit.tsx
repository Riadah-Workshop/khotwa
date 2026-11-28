'use client';
// The daily spending limit, one tap away: what a parent changes at the school gate. Big minus / plus buttons, a few
// common amounts, and one Save button. Only the daily limit is sent (op "set-daily-limit"): the monthly limit, the allowed
// products and the purchase switch stay as they are. The limit stays until it is changed again.
import {useState} from 'react';
import {Check, Minus, Plus, Wallet} from 'lucide-react';
import '../ui/kx.css';
import {Card} from '../ui/kx';
import {clampSar, MAX_SAR, parseSar, PRESETS, STEP} from './limit-input';


const sar = (value: number, language: 'ar' | 'en') => {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return language === 'en' ? `SAR ${text}` : `${text} ر.س`;
};

export default function QuickLimit({language, studentName, currentMinor, spentTodayMinor, busy, disabled, onSave}: {
  language: 'ar' | 'en';
  studentName: string;
  currentMinor: number;
  spentTodayMinor: number;
  busy: boolean;
  disabled: boolean;
  onSave: (dailyLimit: string) => void;
}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const current = currentMinor / 100;
  const [text, setText] = useState(String(current));
  const parsed = parseSar(text);
  const value = parsed === null ? null : Math.min(MAX_SAR, parsed);
  const dirty = value !== null && value !== current;
  const set = (next: number) => setText(String(clampSar(next)));
  return (
    <Card tone="violet" icon={<Wallet size={18} />} tourId="fsp-quick-limit"
      title={studentName ? t(`الحد اليومي لـ ${studentName}`, `Daily limit for ${studentName}`) : t('الحد اليومي', 'Daily limit')}
      description={t('يتغير فوراً ويبقى كل يوم حتى تغيّره مرة أخرى.', 'Changes at once and stays every day until you change it again.')}>
      <div className="fsp-ql">
        <button type="button" className="fsp-ql-step" aria-label={t('تقليل الحد', 'Lower the limit')} disabled={disabled || busy || (value ?? current) <= 0} onClick={() => set((value ?? current) - STEP)}><Minus size={22} /></button>
        <label className="fsp-ql-value">
          <span className="fsp-ql-sr">{t('الحد اليومي بالريال', 'Daily limit in riyals')}</span>
          <input inputMode="decimal" dir="ltr" autoComplete="off" value={text} disabled={disabled || busy} onChange={(event) => setText(event.target.value)} aria-invalid={parsed === null} />
          <b>{t('ر.س', 'SAR')}</b>
        </label>
        <button type="button" className="fsp-ql-step" aria-label={t('زيادة الحد', 'Raise the limit')} disabled={disabled || busy || (value ?? current) >= MAX_SAR} onClick={() => set((value ?? current) + STEP)}><Plus size={22} /></button>
      </div>
      <div className="fsp-chips" role="group" aria-label={t('مبالغ شائعة', 'Common amounts')}>
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="fsp-chip" aria-pressed={value === preset} disabled={disabled || busy} onClick={() => set(preset)}>{preset}</button>
        ))}
      </div>
      {parsed === null && <p className="fsp-ql-note" role="alert" data-bad="1">{t('اكتب رقماً صحيحاً مثل 10 أو 7.5', 'Enter a valid number like 10 or 7.5')}</p>}
      {parsed !== null && parsed > MAX_SAR && <p className="fsp-ql-note" role="alert" data-bad="1">{t(`الحد الأقصى ${MAX_SAR} ر.س`, `The most allowed is SAR ${MAX_SAR}`)}</p>}
      <p className="fsp-ql-note">
        {t('صُرف اليوم ', 'Spent today ')}<strong dir="ltr">{sar(spentTodayMinor / 100, language)}</strong>
        {t(' · الحد الحالي ', ' · current limit ')}<strong dir="ltr">{sar(current, language)}</strong>
        {value === 0 && <> · <strong>{t('لن يتمكن من الشراء اليوم', 'purchases are blocked')}</strong></>}
      </p>
      <div className="kx-btn-row">
        <button type="button" className="kx-btn is-solid fsp-ql-save" data-tone="violet" disabled={disabled || busy || !dirty} onClick={() => value !== null && onSave(String(value))}>
          <Check size={18} />{dirty ? t(`حفظ الحد: ${sar(value ?? 0, 'ar')}`, `Save limit: ${sar(value ?? 0, 'en')}`) : t('الحد محفوظ', 'Limit is saved')}
        </button>
      </div>
    </Card>
  );
}
