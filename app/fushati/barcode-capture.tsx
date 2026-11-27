'use client';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Camera, ScanBarcode, Square} from 'lucide-react';
import {barcodeMessage, barcodeProblem, normalizeBarcode} from '../../lib/fushati/barcode';

type Controls = {stop: () => void};

/**
 * Takes a barcode from whichever way the person has: a scanner plugged in or paired by Bluetooth (it types the digits
 * and presses Enter, so a focused box is all it needs), the phone camera, or the keys. The camera stays on between
 * scans; while `paused` is true a code that is read is ignored, so the screen can show its result without being
 * overtaken by the next read.
 */
export default function BarcodeCapture({language, onCode, paused, label}: {language: 'ar' | 'en'; onCode: (code: string) => void; paused: boolean; label?: string}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off');
  const [cameraError, setCameraError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const controls = useRef<Controls | null>(null);
  const wanted = useRef(false);
  const recent = useRef({code: '', time: 0});
  const pausedRef = useRef(paused);
  const emit = useRef(onCode);
  // A phone should not pop its keyboard open by itself; a computer with a scanner needs the box focused.
  const [focusBox] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)')?.matches);

  useEffect(() => { pausedRef.current = paused; emit.current = onCode; });
  // After a result is saved the box is ready again for the next scanner read.
  useEffect(() => { if (!paused && focusBox) box.current?.focus(); }, [paused, focusBox]);

  function stopCamera() {
    wanted.current = false;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setCamera('off');
  }
  useEffect(() => () => {
    wanted.current = false;
    controls.current?.stop();
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('هذا المتصفح لا يتيح الكاميرا. استخدم قارئ باركود أو اكتب الرقم.', 'This browser cannot use the camera. Use a barcode scanner or type the number.'));
      return;
    }
    setCameraError('');
    setCamera('starting');
    wanted.current = true;
    try {
      const {BrowserMultiFormatReader} = await import('@zxing/browser');
      if (!wanted.current) return;
      const reader = new BrowserMultiFormatReader();
      const started = await reader.decodeFromConstraints(
        {audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}},
        video.current || undefined,
        (result) => {
          if (!result || !wanted.current || pausedRef.current) return;
          const code = normalizeBarcode(result.getText());
          // A camera sometimes misreads one digit: a code that fails its check digit is simply read again.
          if (barcodeProblem(code)) return;
          if (recent.current.code === code && Date.now() - recent.current.time < 2500) return;
          recent.current = {code, time: Date.now()};
          setProblem('');
          emit.current(code);
        },
      );
      if (!wanted.current) started.stop();
      else {
        controls.current = started;
        setCamera('on');
      }
    } catch {
      stopCamera();
      setCameraError(t('تعذر تشغيل الكاميرا. اسمح للمتصفح باستخدامها ثم أعد المحاولة.', 'Could not start the camera. Allow the browser to use it, then try again.'));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pausedRef.current) return;
    const code = normalizeBarcode(text);
    const found = barcodeProblem(code);
    if (found) {
      setProblem(barcodeMessage(found, language));
      return;
    }
    setProblem('');
    setText('');
    recent.current = {code, time: Date.now()};
    emit.current(code);
  }

  return <div className="cfs-capture">
    <form className="cfs-box" onSubmit={submit}>
      <label className="kx-field">
        <span>{label || t('امسح الباركود بالقارئ، أو اكتبه', 'Scan the barcode with a scanner, or type it')}</span>
        <input ref={box} className="kx-input cfs-input" dir="ltr" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" autoFocus={focusBox} disabled={paused}
          value={text} onChange={(event) => { setText(event.target.value); setProblem(''); }} placeholder="6281000000000"/>
      </label>
      <button className="kx-btn is-solid" disabled={paused || !text.trim()}><ScanBarcode size={18} aria-hidden="true"/>{t('بحث', 'Look up')}</button>
    </form>
    <div className="cfs-camera-row">
      {camera === 'off'
        ? <button type="button" className="kx-btn" onClick={startCamera}><Camera size={18} aria-hidden="true"/>{t('مسح بالكاميرا', 'Scan with the camera')}</button>
        : <button type="button" className="kx-btn" onClick={stopCamera}><Square size={16} aria-hidden="true"/>{camera === 'starting' ? t('جارٍ تشغيل الكاميرا…', 'Starting the camera…') : t('إيقاف الكاميرا', 'Stop the camera')}</button>}
    </div>
    <video ref={video} className="cfs-video" playsInline muted hidden={camera === 'off'} aria-label={t('معاينة الكاميرا', 'Camera preview')}/>
    {problem && <p role="alert" className="cfs-problem">{problem}</p>}
    {cameraError && <p role="alert" className="cfs-problem">{cameraError}</p>}
  </div>;
}
