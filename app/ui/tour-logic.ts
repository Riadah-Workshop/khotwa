// Pure helpers for the guided tour (no React, no DOM), so they can be tested on their own.

export type TourStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type Box = {top: number; left: number; width: number; height: number};
export type Size = {width: number; height: number};

/** One key per platform and account, so a second parent on the same phone gets their own tour. */
export function tourStorageKey(platform: string, accountKey?: string): string {
  const account = (accountKey || '-').replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 80) || '-';
  return `khotwa:tour:v1:${platform}:${account}`;
}

export function tourSeen(storage: TourStorage | null | undefined, key: string): boolean {
  // No storage means nothing can remember that the tour was shown; do not show it on every load.
  if (!storage) return true;
  try {
    return storage.getItem(key) === 'done';
  } catch {
    // Storage can throw (private mode, blocked cookies). Treat it as "seen" so a
    // broken browser is not shown the tour on every single page load.
    return true;
  }
}

export function markTourSeen(storage: TourStorage | null | undefined, key: string): void {
  try {
    storage?.setItem(key, 'done');
  } catch {
    /* nothing to do: the tour simply shows again next time */
  }
}

export function clampStep(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** Left/right arrows swap meaning in right-to-left languages. */
export function keyDirection(key: string, rtl: boolean): 'next' | 'prev' | null {
  if (key === 'ArrowRight') return rtl ? 'prev' : 'next';
  if (key === 'ArrowLeft') return rtl ? 'next' : 'prev';
  return null;
}

/**
 * Where to put the explanation card. With a target it goes below it when there
 * is room, otherwise above it, otherwise at the centre of the screen; it never
 * leaves the viewport. Without a target it is centred.
 */
export function placeCard(target: Box | null, card: Size, viewport: Size, gap = 14, margin = 12): {top: number; left: number} {
  const maxLeft = Math.max(margin, viewport.width - card.width - margin);
  const maxTop = Math.max(margin, viewport.height - card.height - margin);
  const centred = {top: Math.round(Math.max(margin, (viewport.height - card.height) / 2)), left: Math.round(Math.max(margin, (viewport.width - card.width) / 2))};
  if (!target) return centred;
  const clampLeft = (value: number) => Math.round(Math.min(Math.max(value, margin), maxLeft));
  const left = clampLeft(target.left + target.width / 2 - card.width / 2);
  const below = target.top + target.height + gap;
  if (below + card.height <= viewport.height - margin) return {top: Math.round(below), left};
  const above = target.top - gap - card.height;
  if (above >= margin) return {top: Math.round(above), left};
  return centred;
}

/** The spotlight rectangle, padded a little and kept on screen. */
export function spotlightBox(target: Box, viewport: Size, padding = 6): Box {
  const top = Math.max(0, target.top - padding);
  const left = Math.max(0, target.left - padding);
  const right = Math.min(viewport.width, target.left + target.width + padding);
  const bottom = Math.min(viewport.height, target.top + target.height + padding);
  return {top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
}

/**
 * A short, non-reversible-looking tag of an account identifier (for example a phone
 * number) used only as part of the browser storage key, so the identifier itself is
 * never written into the page. It is not a security measure.
 */
export function accountTag(value: string | null | undefined): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
