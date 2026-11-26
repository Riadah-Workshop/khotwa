'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, CircleHelp, Eye, GraduationCap, LayoutGrid, LockKeyhole, MapPin, MessageCircle, Receipt, ScanLine, Settings, ShieldCheck, ShoppingBasket, Sparkles, TrendingUp, Users, Wallet, Warehouse, X, ChartColumn, ClipboardList, CalendarDays, Download, DoorOpen} from 'lucide-react';
import type {ReactNode} from 'react';
import {Chip} from './kx';
import {TOURS, type TourIconName, type TourPlatform, type TourStep} from './tours';
import {clampStep, keyDirection, markTourSeen, placeCard, spotlightBox, tourSeen, tourStorageKey, type Box} from './tour-logic';

const ICONS: Record<TourIconName, ReactNode> = {
  welcome: <Sparkles size={22}/>, children: <Users size={22}/>, attendance: <CalendarDays size={22}/>, cases: <ClipboardList size={22}/>, wallet: <Wallet size={22}/>, card: <ScanLine size={22}/>, transfer: <Receipt size={22}/>, history: <TrendingUp size={22}/>,
  language: <Eye size={22}/>, password: <LockKeyhole size={22}/>, help: <CircleHelp size={22}/>, inventory: <Warehouse size={22}/>, reports: <ChartColumn size={22}/>, map: <MapPin size={22}/>, settings: <Settings size={22}/>, students: <GraduationCap size={22}/>,
  messages: <MessageCircle size={22}/>, visitors: <DoorOpen size={22}/>, shield: <ShieldCheck size={22}/>, scan: <ScanLine size={22}/>, cafeteria: <ShoppingBasket size={22}/>, dashboard: <LayoutGrid size={22}/>, backup: <Download size={22}/>,
};

const LABELS = {
  ar: {next: 'التالي', back: 'السابق', skip: 'تخطي', done: 'ابدأ الآن', step: (n: number, total: number) => `الخطوة ${n} من ${total}`, close: 'إغلاق الجولة', help: 'جولة تعريفية'},
  en: {next: 'Next', back: 'Back', skip: 'Skip', done: 'Get started', step: (n: number, total: number) => `Step ${n} of ${total}`, close: 'Close tour', help: 'Take the tour'},
};
export const tourHelpLabel = (language: 'ar' | 'en') => LABELS[language].help;

/**
 * Opens the tour by itself the first time (per platform and account, kept in the
 * browser) once `ready` is true, and can be replayed with start().
 */
export function useTour(platform: TourPlatform, accountKey?: string, ready = true) {
  const [open, setOpen] = useState(false);
  const key = tourStorageKey(platform, accountKey);
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    if (!tourSeen(window.localStorage, key)) setOpen(true);
  }, [ready, key]);
  const start = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    markTourSeen(window.localStorage, key);
    setOpen(false);
  }, [key]);
  return {open, start, close};
}

function readBox(selector: string | undefined): Box | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return {top: rect.top, left: rect.left, width: rect.width, height: rect.height};
}

export function GuidedTour({platform, open, onClose, language, onSection}: {platform: TourPlatform; open: boolean; onClose: () => void; language: 'ar' | 'en'; onSection?: (section: string) => void}) {
  const steps: TourStep[] = TOURS[platform] || [];
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({width: 1024, height: 768});
  const [cardSize, setCardSize] = useState({width: 380, height: 220});
  const cardRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef(onSection);
  sectionRef.current = onSection;
  const returnFocus = useRef<HTMLElement | null>(null);
  const labels = LABELS[language];
  const rtl = language === 'ar';
  const step = steps[clampStep(index, steps.length)];
  const last = index >= steps.length - 1;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { returnFocus.current?.focus?.(); };
  }, [open]);

  // Open the right tab, bring the target into view, then follow it while the page moves.
  useEffect(() => {
    if (!open || !step) return;
    if (step.section) sectionRef.current?.(step.section);
    let cancelled = false;
    let tries = 0;
    let desktopScrolled = false;
    // adjust: also move the page so the target sits in the free space (only during the first moments of a step,
    // so a person who scrolls on purpose is not pulled back).
    const measure = (adjust: boolean) => {
      if (cancelled) return;
      setView({width: window.innerWidth, height: window.innerHeight});
      const found = step.target ? document.querySelector(step.target) : null;
      if (found instanceof HTMLElement && adjust) {
        const rect = found.getBoundingClientRect();
        if (window.innerWidth <= 640) {
          // Phone: the card sits at the bottom, so put the target in the free space above it.
          const free = window.innerHeight - (cardRef.current?.offsetHeight || 230) - 28;
          const wanted = rect.height >= free - 16 ? 16 : Math.max(16, (free - rect.height) / 2);
          if (Math.abs(rect.top - wanted) > 4) window.scrollBy({top: rect.top - wanted});
        } else if (!desktopScrolled) {
          found.scrollIntoView({block: 'center', inline: 'nearest'});
          desktopScrolled = true;
        }
      }
      setBox(readBox(step.target));
      if (cardRef.current) setCardSize({width: cardRef.current.offsetWidth, height: cardRef.current.offsetHeight});
    };
    // The target may appear a moment after a tab switch, so look a few times.
    const retry = window.setInterval(() => { tries += 1; measure(true); if (tries >= 25) window.clearInterval(retry); }, 90);
    const follow = () => measure(false);
    measure(true);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => { cancelled = true; window.clearInterval(retry); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); };
  }, [open, step]);

  // On phones the card covers the bottom of the screen; extra room at the end of the page lets the last sections scroll above it.
  useEffect(() => {
    if (!open || window.innerWidth > 640) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = '280px';
    return () => { document.body.style.paddingBottom = previous; };
  }, [open]);

  useEffect(() => { if (open) cardRef.current?.focus(); }, [open, index]);

  const go = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') {
      if (last) onClose(); else setIndex(i => clampStep(i + 1, steps.length));
    } else setIndex(i => clampStep(i - 1, steps.length));
  }, [last, onClose, steps.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      const direction = keyDirection(event.key, rtl);
      if (direction) { event.preventDefault(); go(direction); return; }
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'));
        if (!focusable.length) return;
        const first = focusable[0], lastEl = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); lastEl.focus(); }
        else if (!event.shiftKey && document.activeElement === lastEl) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, rtl, go, onClose]);

  if (!open || !step) return null;
  const narrow = view.width <= 640;
  const position = narrow ? undefined : placeCard(box, cardSize, view);
  const spot = box ? spotlightBox(box, view) : null;
  const tone = step.tone || 'green';
  return <div dir={rtl ? 'rtl' : 'ltr'} lang={language}>
    <div className="kx-tour-backdrop" aria-hidden="true"/>
    {spot ? <div className="kx-tour-spot" style={{top: spot.top, left: spot.left, width: spot.width, height: spot.height}} aria-hidden="true"/> : <div className="kx-tour-dim" aria-hidden="true"/>}
    <div ref={cardRef} className="kx-tour-card" role="dialog" aria-modal="true" aria-labelledby="kx-tour-title" tabIndex={-1} style={position ? {top: position.top, left: position.left} : undefined} data-tone={tone}>
      <div className="kx-tour-top"><Chip icon={ICONS[step.icon]} tone={tone}/><div style={{flex: 1}}><small style={{color: 'var(--kx-muted)'}}>{labels.step(index + 1, steps.length)}</small><h2 id="kx-tour-title">{step.title[language]}</h2></div>
        <button type="button" className="kx-btn is-icon is-small" onClick={onClose} aria-label={labels.close}><X size={16}/></button></div>
      <p>{step.body[language]}</p>
      <div className="kx-tour-foot">
        <div className="kx-tour-dots" aria-hidden="true">{steps.map((s, i) => <i key={s.id} className={i === index ? 'on' : ''}/>)}</div>
        <div className="kx-btn-row">
          {!last && <button type="button" className="kx-btn is-small" onClick={onClose}>{labels.skip}</button>}
          {index > 0 && <button type="button" className="kx-btn is-small" onClick={() => go('prev')}>{rtl ? <ArrowRight size={15}/> : <ArrowLeft size={15}/>}{labels.back}</button>}
          <button type="button" className="kx-btn is-small is-solid" data-tone={tone} onClick={() => go('next')}>{last ? <Check size={15}/> : null}{last ? labels.done : labels.next}{!last && (rtl ? <ArrowLeft size={15}/> : <ArrowRight size={15}/>)}</button>
        </div>
      </div>
    </div>
  </div>;
}

export function TourHelpButton({onClick, language, tourId}: {onClick: () => void; language: 'ar' | 'en'; tourId?: string}) {
  return <button type="button" className="kx-btn" onClick={onClick} data-tour={tourId} aria-label={tourHelpLabel(language)}><CircleHelp size={18}/><span className="kx-btn-text">{tourHelpLabel(language)}</span></button>;
}
