'use client';
import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {menuIsEmpty, nextIndex, placeMenu, typedMatches, visibleActions} from './action-menu-logic';

export type MenuTone = 'red' | 'amber' | 'blue' | 'green' | 'slate';

export type MenuAction = {
  label: string;
  icon?: ReactNode;
  tone?: MenuTone;
  onSelect?: () => void;
  /** Opens a link instead of running onSelect. */
  href?: string;
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
  /**
   * Asks before doing it, inside the list itself (no popup): the list turns into the question with Yes / No.
   * With `expected` the person must also type that word again (for something very hard to undo).
   */
  confirm?: {message: string; yes: string; no: string; expected?: string};
};

/**
 * The three-dot button. Press it, a short list opens next to it, press a row and it happens. Everything that edits, deletes
 * or archives a row of a list goes in here instead of being a row of buttons, so a list reads cleanly on a phone.
 *
 * - It draws nothing when every row is hidden (for example a person who may not edit).
 * - Arrow keys move through the rows, Home/End jump, Enter or Space picks, Escape closes and returns to the button.
 * - The list is drawn straight into <body> so a card with overflow:hidden or a table cannot cut it off.
 * - It closes when the window scrolls, is resized, or something else is pressed.
 */
export function ActionMenu({label, actions, tone = 'slate', small, className, tourId, disabled}: {
  label: string; actions: MenuAction[]; tone?: MenuTone; small?: boolean; className?: string; tourId?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(-1);
  const [typed, setTyped] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = visibleActions(actions);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false); setAsking(-1); setTyped('');
    if (returnFocus) trigger.current?.focus();
  }, []);

  const rows = useCallback(() => Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []), []);
  const usable = useCallback(() => rows().map(row => !(row as HTMLButtonElement).disabled && row.getAttribute('aria-disabled') !== 'true'), [rows]);
  const focusRow = useCallback((index: number) => { if (index >= 0) rows()[index]?.focus(); }, [rows]);

  // Next to the button, inside the window. Written straight onto the element (no state) so there is no flash at the old place.
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const el = panel.current;
    const put = () => {
      const box = trigger.current!.getBoundingClientRect();
      // The list lives in <body>, so it takes the direction (and language) of the button it belongs to, not the page's.
      const direction = getComputedStyle(trigger.current!).direction;
      el.setAttribute('dir', direction);
      const lang = trigger.current!.closest('[lang]')?.getAttribute('lang');
      if (lang) el.setAttribute('lang', lang);
      const rtl = direction === 'rtl';
      const at = placeMenu({top: box.top, bottom: box.bottom, left: box.left, right: box.right}, {width: el.offsetWidth, height: el.scrollHeight}, {width: window.innerWidth, height: window.innerHeight}, rtl);
      el.style.top = at.top + 'px'; el.style.left = at.left + 'px'; el.style.maxHeight = at.maxHeight + 'px'; el.style.visibility = 'visible';
    };
    put();
    // The question after "Delete" is taller or shorter than the list: place it again.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(put);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [open, asking]);

  // First row gets the focus when the list opens (the question's "No" has autoFocus).
  useEffect(() => {
    if (!open || asking >= 0) return;
    const index = nextIndex(-1, 'ArrowDown', usable());
    focusRow(index);
  }, [open, asking, usable, focusRow]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    const away = (event: Event) => { if (panel.current && event.target instanceof Node && panel.current.contains(event.target)) return; close(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away); };
  }, [open, close]);

  if (menuIsEmpty(actions)) return null;

  const run = (action: MenuAction) => {
    close(false);
    action.onSelect?.();
    // If the row is still there and nothing took the focus (an editor page does), the button gets it back.
    window.requestAnimationFrame(() => {
      const el = trigger.current;
      if (el && el.isConnected && (!document.activeElement || document.activeElement === document.body)) el.focus();
    });
  };
  const choose = (action: MenuAction, index: number) => {
    if (action.disabled) return;
    if (action.confirm) { setAsking(index); setTyped(''); return; }
    run(action);
  };
  const onTriggerKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
  };
  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (asking >= 0) setAsking(-1); else close(true); return; }
    if (event.key === 'Tab') { close(false); return; }
    if (asking >= 0) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const list = rows();
      const current = list.findIndex(row => row === document.activeElement);
      focusRow(nextIndex(current, event.key, usable()));
    }
  };

  const question = asking >= 0 ? shown[asking] : null;
  const confirm = question?.confirm;
  const can = !!confirm && (!confirm.expected || typedMatches(typed, confirm.expected));

  return <>
    <button ref={trigger} type="button" className={'am-trigger' + (small ? ' is-small' : '') + (className ? ' ' + className : '')} data-tone={tone} data-tour={tourId}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} title={label} disabled={disabled}
      onClick={() => (open ? close(false) : setOpen(true))} onKeyDown={onTriggerKey}>
      <svg viewBox="0 0 24 24" width={small ? 18 : 20} height={small ? 18 : 20} aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>
    </button>
    {open && createPortal(<div ref={panel} id={id} className="am-menu" role="menu" aria-label={label} style={{visibility: 'hidden'}} onKeyDown={onPanelKey}>
      {!question && shown.map((action, index) => {
        const props = {role: 'menuitem', tabIndex: -1, className: 'am-item', 'data-tone': action.tone};
        return <div key={index} className="am-row">
          {action.separatorBefore && <div className="am-sep" role="separator"/>}
          {action.href && !action.disabled
            ? <a {...props} href={action.href} onClick={() => close(false)}>{action.icon}<span>{action.label}</span></a>
            : <button type="button" {...props} disabled={action.disabled} onClick={() => choose(action, index)}>{action.icon}<span>{action.label}</span></button>}
        </div>;
      })}
      {question && confirm && <div className="am-ask" role="group" aria-label={confirm.message} data-tone={question.tone}>
        <p>{confirm.message}{confirm.expected && <> <code dir="ltr">{confirm.expected}</code></>}</p>
        {confirm.expected && <input className="am-input" dir="ltr" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={event => setTyped(event.target.value)} aria-label={confirm.message}/>}
        <div className="am-ask-buttons">
          <button type="button" className="am-yes" data-tone={question.tone === 'red' || !question.tone ? 'red' : question.tone} disabled={!can} onClick={() => run(question)}>{confirm.yes}</button>
          <button type="button" className="am-no" autoFocus={!confirm.expected} onClick={() => setAsking(-1)}>{confirm.no}</button>
        </div>
      </div>}
    </div>, document.body)}
  </>;
}
