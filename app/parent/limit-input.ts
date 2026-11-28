// The daily limit a parent types or taps. Pure (no imports) so the tests can run it directly.
export const PRESETS = [0, 3, 5, 10, 15, 20, 30];
export const MAX_SAR = 100; // the server refuses more than SAR 100 a day
export const STEP = 1;

const ARABIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

/** "7", "7.5", "7,5" and Arabic-Indic digits are all fine; anything else is "not a number" (null). */
export function parseSar(text: string): number | null {
  const digits = text
    .replace(/[\u0660-\u0669]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[,\u066b]/, '.')
    .trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(digits)) return null;
  return Number(digits);
}

/** The value the buttons and chips may set: whole riyals or halalas, never below 0 or above the maximum. */
export function clampSar(value: number): number {
  return Math.min(MAX_SAR, Math.max(0, Math.round(value * 100) / 100));
}
