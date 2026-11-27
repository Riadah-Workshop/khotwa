// Small pure rules for the scan-a-barcode screen, kept free of imports so the tests can load them as they are.

export const MAX_QUANTITY = 100000;
const DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = DIGITS.indexOf(digit);
    return String(arabic >= 0 ? arabic : PERSIAN_DIGITS.indexOf(digit));
  });
}

/** A quantity typed by a person as a whole number of units (1 to 100,000). Null when empty or not usable. */
export function quantityInput(text: string): number | null {
  const clean = latinDigits(text.trim()).replace(/[\s,٬]/g, '');
  if (!/^\d{1,6}$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 1 && value <= MAX_QUANTITY ? value : null;
}

/** A price or cost typed by a person ("12.5", "١٢٫٥") as the text the server expects; '' for empty; null when not usable. */
export function amountInput(text: string): string | null {
  const clean = latinDigits(text.trim()).replace(/[٫,]/g, '.');
  if (clean === '') return '';
  return /^\d{1,5}(\.\d{1,2})?$/.test(clean) ? clean : null;
}

export type ScanAnswer = {created: boolean; pending: boolean; name: string; received: number; onHand: number | null; duplicate: boolean};

/** The line shown after a scan was saved. */
export function savedMessage(answer: ScanAnswer, en: boolean): string {
  const parts: string[] = [];
  if (answer.created) {
    parts.push(answer.pending
      ? (en ? 'added; the administrator will set its price and approve it' : 'أُضيف بانتظار تسعيره واعتماده من المدير')
      : (en ? 'added and on sale' : 'أُضيف وهو متاح للبيع'));
  }
  if (answer.duplicate) parts.push(en ? 'this scan was already saved, so nothing was added twice' : 'سُجّل هذا المسح من قبل، فلم تُضَف الكمية مرتين');
  else if (answer.received > 0) parts.push(en ? `+${answer.received} added, ${answer.onHand ?? answer.received} in stock now` : `أُضيف ${answer.received}، المتوفر الآن ${answer.onHand ?? answer.received}`);
  else if (!answer.created) parts.push(en ? 'no quantity added' : 'لم تُضف كمية');
  return `${answer.name}: ${parts.join(en ? '; ' : '، ')}.`;
}

export type NewProduct = {name: string; price: string; canPrice: boolean};

/** Why a new product cannot be saved yet, or null. */
export function newProductProblem(product: NewProduct, en: boolean): string | null {
  if (product.name.trim().length < 2) return en ? 'Enter the product name (at least 2 letters).' : 'اكتب اسم المنتج (حرفان على الأقل).';
  if (product.canPrice && product.price.trim() !== '' && amountInput(product.price) === null) return en ? 'The price is not valid. Use numbers such as 2.50.' : 'السعر غير صحيح. استخدم أرقاماً مثل 2.50.';
  return null;
}

export type ProductFilter = 'all' | 'pending' | 'sale' | 'off';
export type ProductRow = {name: string; category: string; barcode: string | null; active: number; available: number};

/** A product's place in the list: waiting for approval, on sale, or switched off for now. */
export function productState(row: Pick<ProductRow, 'active' | 'available'>): Exclude<ProductFilter, 'all'> {
  if (!row.active) return 'pending';
  return row.available ? 'sale' : 'off';
}

/** Search by name, category or barcode, then by state. Barcode digits typed in Arabic still match. */
export function filterProducts<T extends ProductRow>(rows: T[], search: string, filter: ProductFilter): T[] {
  const needle = latinDigits(search.trim()).toLowerCase();
  return rows.filter((row) => {
    if (filter !== 'all' && productState(row) !== filter) return false;
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || row.category.toLowerCase().includes(needle) || (row.barcode || '').toLowerCase().includes(needle);
  });
}
