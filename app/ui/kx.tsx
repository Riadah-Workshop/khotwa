import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';
import {ArrowLeft, Check, X} from 'lucide-react';

export type Tone = 'green' | 'teal' | 'blue' | 'violet' | 'amber' | 'red' | 'slate';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** A rounded square holding an icon, coloured by tone. Decorative: the text next to it says what it is. */
export function Chip({icon, tone, size}: {icon: ReactNode; tone?: Tone; size?: 'small' | 'large'}) {
  return <span className={cx('kx-iconchip', size === 'large' && 'is-large', size === 'small' && 'is-small')} data-tone={tone} aria-hidden="true">{icon}</span>;
}

export function PageHead({icon, tone, title, description, actions}: {icon: ReactNode; tone?: Tone; title: string; description?: string; actions?: ReactNode}) {
  return <div className="kx-pagehead"><Chip icon={icon} tone={tone} size="large"/><div className="kx-pagehead-text"><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="kx-pagehead-actions">{actions}</div>}</div>;
}

export function Card({icon, tone, title, description, actions, children, tourId, id}: {icon?: ReactNode; tone?: Tone; title?: string; description?: string; actions?: ReactNode; children?: ReactNode; tourId?: string; id?: string}) {
  return <section className="kx-card" data-tone={tone} data-tour={tourId} id={id}>
    {title && <header className="kx-card-head">{icon && <Chip icon={icon} tone={tone} size="small"/>}<div className="kx-card-title"><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</header>}
    <div className="kx-card-body">{children}</div>
  </section>;
}

export function Stat({icon, tone, label, value, hint, tourId}: {icon: ReactNode; tone?: Tone; label: string; value: ReactNode; hint?: string; tourId?: string}) {
  return <div className="kx-stat" data-tone={tone} data-tour={tourId}><Chip icon={icon} tone={tone}/><div><span className="kx-stat-label">{label}</span><strong className="kx-stat-value">{value}</strong>{hint && <span className="kx-stat-hint">{hint}</span>}</div></div>;
}

export function Notice({tone = 'blue', icon, title, children, role}: {tone?: Tone; icon?: ReactNode; title?: string; children?: ReactNode; role?: 'alert' | 'status'}) {
  return <div className="kx-notice" data-tone={tone} role={role}>{icon}<div>{title && <strong>{title}</strong>}{children && <p>{children}</p>}</div></div>;
}

export function Empty({icon, children}: {icon?: ReactNode; children: ReactNode}) {
  return <div className="kx-empty">{icon && <Chip icon={icon} tone="slate" size="large"/>}<p>{children}</p></div>;
}

export function Badge({tone, icon, children}: {tone?: Tone; icon?: ReactNode; children: ReactNode}) {
  return <span className="kx-badge" data-tone={tone}>{icon}{children}</span>;
}

/** A bar split into coloured segments. The numbers are also written in the legend, never colour alone. */
export function Meter({segments, label}: {segments: Array<{tone: Tone; value: number; label: string}>; label: string}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return <div>
    <div className="kx-meter" role="img" aria-label={`${label}: ${segments.map(s => `${s.label} ${s.value}`).join('، ')}`}>
      {total > 0 && segments.filter(s => s.value > 0).map(s => <span key={s.label} data-tone={s.tone} style={{width: `${(s.value / total) * 100}%`}}/>)}
    </div>
    <div className="kx-legend" style={{marginBlockStart: 8}}>{segments.map(s => <span key={s.label} data-tone={s.tone}>{s.label}: <b>{s.value}</b></span>)}</div>
  </div>;
}

export type TabItem = {id: string; label: string; icon?: ReactNode; tone?: Tone; badge?: number};

/**
 * Tabs with the keyboard behaviour screen-reader users expect: arrow keys move
 * between tabs (reversed in right-to-left layouts), Home and End jump to the ends.
 * The panel that goes with a tab must have id `${idPrefix}-panel-${tab.id}`.
 */
export function Tabs({items, value, onChange, label, idPrefix, rtl, tourId}: {items: TabItem[]; value: string; onChange: (id: string) => void; label: string; idPrefix: string; rtl?: boolean; tourId?: string}) {
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
    else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    onChange(items[next].id);
    document.getElementById(`${idPrefix}-tab-${items[next].id}`)?.focus();
  }
  return <div className="kx-tabs" role="tablist" aria-label={label} data-tour={tourId}>
    {items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${idPrefix}-tab-${item.id}`} aria-selected={value === item.id} aria-controls={`${idPrefix}-panel-${item.id}`} tabIndex={value === item.id ? 0 : -1} className="kx-tab" data-tone={item.tone} onClick={() => onChange(item.id)} onKeyDown={event => onKey(event, index)}>
      {item.icon}<span>{item.label}</span>{item.badge ? <span className="kx-badge" data-tone="amber">{item.badge}</span> : null}
    </button>)}
  </div>;
}

export function TabPanel({idPrefix, id, active, children}: {idPrefix: string; id: string; active: boolean; children: ReactNode}) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active} className="kx-grid">{active ? children : null}</div>;
}

/**
 * A screen to add or change something, shown in place of the list it came from, never over it: "go in, enter the
 * details, save, come back out". It replaces popups. The page above and below stays as it was; Back returns to the
 * list. When `dirty` is true, Back first asks, in the same place, whether to throw the changes away.
 */
export function EditorView({title, description, icon, tone, onBack, backLabel, dirty, dirtyMessage, keepLabel, discardLabel, children, actions, tourId}: {
  title: string; description?: string; icon?: ReactNode; tone?: Tone; onBack: () => void; backLabel: string;
  dirty?: boolean; dirtyMessage?: string; keepLabel?: string; discardLabel?: string; children: ReactNode; actions?: ReactNode; tourId?: string;
}) {
  const [asking, setAsking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({preventScroll: true});
    heading.current?.scrollIntoView({block: 'start'});
  }, []);
  const back = () => { if (dirty) setAsking(true); else onBack(); };
  return <section className="kx-editor" data-tone={tone} data-tour={tourId} aria-labelledby="kx-editor-title">
    <header className="kx-editor-head">
      <button type="button" className="kx-btn is-soft" onClick={back}><ArrowLeft size={18} className="kx-flip" aria-hidden="true"/>{backLabel}</button>
      {icon && <Chip icon={icon} tone={tone} size="large"/>}
      <div className="kx-editor-title"><h2 id="kx-editor-title" ref={heading} tabIndex={-1}>{title}</h2>{description && <p>{description}</p>}</div>
    </header>
    {asking && dirty && <div className="kx-confirm is-wide" role="alert">
      <span>{dirtyMessage}</span>
      <button type="button" className="kx-btn is-small is-solid" data-tone="red" onClick={onBack}><X size={16} aria-hidden="true"/>{discardLabel}</button>
      <button type="button" className="kx-btn is-small" autoFocus onClick={() => setAsking(false)}><Check size={16} aria-hidden="true"/>{keepLabel}</button>
    </div>}
    <div className="kx-editor-body">{children}</div>
    {actions && <div className="kx-editor-bar">{actions}</div>}
  </section>;
}

/** A button for something that cannot be undone. The first press turns it into "Are you sure? Yes / No" in the same place. */
export function ConfirmButton({label, icon, tone = 'red', message, confirmLabel, cancelLabel, onConfirm, disabled, small = true, solid}: {
  label: string; icon?: ReactNode; tone?: Tone; message: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; disabled?: boolean; small?: boolean; solid?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={cx('kx-btn', small && 'is-small', solid ? 'is-solid' : 'is-soft')} data-tone={tone} disabled={disabled} onClick={() => setAsking(true)}>{icon}{label}</button>;
  return <span className="kx-confirm" role="group" aria-label={message}>
    <span>{message}</span>
    <button type="button" className="kx-btn is-small is-solid" data-tone={tone} disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
    <button type="button" className="kx-btn is-small" autoFocus onClick={() => setAsking(false)}>{cancelLabel}</button>
  </span>;
}

/** For something very hard to undo (a school, an account): the first press asks for a value to be typed again, so it cannot be done by accident. */
export function TypeToConfirm({label, icon, tone = 'red', message, expected, confirmLabel, cancelLabel, onConfirm, disabled, small = true}: {
  label: string; icon?: ReactNode; tone?: Tone; message: string; expected: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; disabled?: boolean; small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  if (!asking) return <button type="button" className={cx('kx-btn', small && 'is-small', 'is-soft')} data-tone={tone} disabled={disabled} onClick={() => setAsking(true)}>{icon}{label}</button>;
  const close = () => { setAsking(false); setTyped(''); };
  return <span className="kx-confirm is-wide" role="group" aria-label={message}>
    <span>{message} <code dir="ltr">{expected}</code></span>
    <input className="kx-input kx-confirm-input" dir="ltr" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)} aria-label={message}/>
    <button type="button" className="kx-btn is-small is-solid" data-tone={tone} disabled={disabled || typed.trim() !== expected} onClick={() => { close(); onConfirm(); }}>{confirmLabel}</button>
    <button type="button" className="kx-btn is-small" onClick={close}>{cancelLabel}</button>
  </span>;
}
