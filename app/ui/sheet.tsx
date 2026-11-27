'use client';
import {ArrowLeft} from 'lucide-react';
import {UiText} from '../locale';

/**
 * The "Back" bar at the top of a screen that used to be a popup. The screen itself is styled by `sheet.css`
 * (every `.modal-backdrop > .modal` becomes a page of its own); this is the way out that does not need a scroll.
 */
export function SheetBack({onClick, disabled}: {onClick: () => void; disabled?: boolean}) {
  return <div className="sheet-bar">
    <button type="button" className="sheet-back" onClick={onClick} disabled={disabled}><ArrowLeft size={18} className="sheet-flip" aria-hidden="true"/><UiText text="رجوع"/></button>
  </div>;
}
