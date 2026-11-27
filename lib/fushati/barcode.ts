// Product barcodes for the cafeteria menu. Pure rules, no imports: the server, the screens and the tests all use them.
//
// A barcode is what a scanner (or a person) types for a packaged product. Real product codes are digits only
// (EAN-8, UPC-A, EAN-13, ITF-14) and carry a check digit, so a mistyped one is caught here. A cafeteria may also
// print its own labels for things it makes itself, so any other code of 4 to 32 letters and digits is accepted
// as it is (without a check digit).

export const BARCODE_MIN = 4;
export const BARCODE_MAX = 32;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export type BarcodeProblem = 'empty' | 'format' | 'checksum';

/** Trims, turns Arabic digits into 0-9, drops spaces, dashes and the control characters a scanner may add, upper-cases letters. */
export function normalizeBarcode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) {
    const a = ARABIC_INDIC.indexOf(ch);
    const b = EASTERN_ARABIC_INDIC.indexOf(ch);
    if (a >= 0) out += String(a);
    else if (b >= 0) out += String(b);
    else if (/[0-9A-Za-z]/.test(ch)) out += ch.toUpperCase();
    // spaces, dashes, line ends, tabs and any other character are dropped
  }
  return out;
}

/** GS1 check digit (EAN-8, UPC-A, EAN-13, ITF-14): weights 3,1,3,1… counted from the digit next to the check digit. */
export function gs1CheckDigitOk(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return true;
  let sum = 0;
  for (let index = 0; index < code.length - 1; index++) {
    const digit = code.charCodeAt(code.length - 2 - index) - 48;
    sum += digit * (index % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === code.charCodeAt(code.length - 1) - 48;
}

/** Null when the (already normalized) code can be stored, otherwise why not. */
export function barcodeProblem(code: string): BarcodeProblem | null {
  if (!code) return 'empty';
  if (code.length < BARCODE_MIN || code.length > BARCODE_MAX) return 'format';
  return gs1CheckDigitOk(code) ? null : 'checksum';
}

export function barcodeMessage(problem: BarcodeProblem, language: 'ar' | 'en'): string {
  if (language === 'en') {
    if (problem === 'empty') return 'Scan or type the barcode.';
    if (problem === 'format') return `The barcode must be ${BARCODE_MIN} to ${BARCODE_MAX} letters or digits.`;
    return 'This barcode number is not valid. Scan it again or check the digits.';
  }
  if (problem === 'empty') return 'امسح الباركود أو اكتبه.';
  if (problem === 'format') return `الباركود من ${BARCODE_MIN} إلى ${BARCODE_MAX} حرفاً أو رقماً.`;
  return 'رقم الباركود غير صحيح. امسحه مرة أخرى أو راجع الأرقام.';
}
