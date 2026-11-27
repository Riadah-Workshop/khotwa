/**
 * The pure parts of the three-dot menu (action-menu.tsx): where the list goes, which row the keys move to, and what is
 * shown. No imports, so scripts/test-action-menu.mjs can run it without a browser or a build.
 */

export type Box = {top: number; bottom: number; left: number; right: number};
export type Size = {width: number; height: number};
export type Placement = {top: number; left: number; maxHeight: number; above: boolean};

/**
 * Puts the list next to its three-dot button, inside the window.
 * - Horizontally the list's end edge lines up with the button's end edge (the button sits at the end of a row), then it
 *   is pushed back inside the window if it would stick out. `rtl` says which side the end is.
 * - Vertically it opens below the button; if it does not fit there and there is more room above, it opens above;
 *   if neither fits it opens on the roomier side and scrolls (maxHeight).
 */
export function placeMenu(trigger: Box, menu: Size, viewport: Size, rtl: boolean, gap = 6, margin = 8): Placement {
  const width = Math.min(menu.width, Math.max(0, viewport.width - margin * 2));
  let left = rtl ? trigger.left : trigger.right - width;
  left = Math.min(Math.max(left, margin), Math.max(margin, viewport.width - width - margin));
  const roomBelow = viewport.height - trigger.bottom - gap - margin;
  const roomAbove = trigger.top - gap - margin;
  const above = menu.height > roomBelow && roomAbove > roomBelow;
  const room = Math.max(120, above ? roomAbove : roomBelow);
  const height = Math.min(menu.height, room);
  const top = above ? trigger.top - gap - height : trigger.bottom + gap;
  return {top: Math.max(margin, top), left, maxHeight: room, above};
}

/** The row a key moves to: arrows step (wrapping) over rows that can be used, Home and End jump. -1 when no row can be used. */
export function nextIndex(current: number, key: string, usable: boolean[]): number {
  const count = usable.length;
  const first = () => { for (let i = 0; i < count; i++) if (usable[i]) return i; return -1; };
  const last = () => { for (let i = count - 1; i >= 0; i--) if (usable[i]) return i; return -1; };
  if (key === 'Home') return first();
  if (key === 'End') return last();
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return current;
  if (!usable.some(Boolean)) return -1;
  const step = key === 'ArrowDown' ? 1 : -1;
  let index = current;
  for (let n = 0; n < count; n++) {
    index = (index + step + count) % count;
    if (usable[index]) return index;
  }
  return current;
}

/** What a list is made of: rows marked hidden are dropped, and a divider with nothing before or after it is dropped too. */
export function visibleActions<T extends {hidden?: boolean; separatorBefore?: boolean}>(actions: T[]): T[] {
  const shown = actions.filter(action => !action.hidden);
  return shown.map((action, index) => index === 0 && action.separatorBefore ? {...action, separatorBefore: false} : action);
}

/** True when the list has nothing to offer, so the three dots should not be drawn at all. */
export function menuIsEmpty(actions: {hidden?: boolean}[]): boolean {
  return !actions.some(action => !action.hidden);
}

/** Whether the typed word allows a "type it again to confirm" row to go ahead. Letters are compared as typed, spaces at the ends ignored. */
export function typedMatches(typed: string, expected: string): boolean {
  return expected.length > 0 && typed.trim() === expected;
}
