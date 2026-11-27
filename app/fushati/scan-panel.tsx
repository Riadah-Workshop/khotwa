'use client';
import {useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Check, PackageCheck, PackagePlus, ScanBarcode, X} from 'lucide-react';
import '../ui/kx.css';
import './panels.css';
import {Badge, Card, EditorView, Notice} from '../ui/kx';
import {FUSHATI_CATEGORIES} from '../../lib/fushati/categories';
import BarcodeCapture from './barcode-capture';
import {amountInput, newProductProblem, quantityInput, savedMessage} from './scan-ui';
import type {ScanAnswer} from './scan-ui';
import {money, statusLabel, statusTone} from './stock-ui';
import type {StockStatus} from './stock-ui';

type Found = {
  cafeteriaId: string; barcode: string; found: boolean;
  item: {id: string; name: string; category: string; priceMinor: number; active: boolean; available: boolean; barcode: string; tracked?: boolean; onHand?: number; threshold?: number; costMinor?: number} | null;
  can: {create: boolean; price: boolean; stock: boolean; viewStock: boolean};
  error?: string;
};
type SavedBody = ScanAnswer & {ok?: boolean; error?: string; code?: string; id?: string; created?: boolean; name?: string};

const stockStatus = (item: NonNullable<Found['item']>): StockStatus => !item.tracked ? 'untracked' : (item.onHand ?? 0) <= 0 ? 'out' : (item.onHand ?? 0) <= (item.threshold ?? 5) ? 'low' : 'ok';

/**
 * "Scan a product": the barcode on the item is read, and a product the cafeteria already knows needs only its
 * quantity. A barcode seen for the first time asks for the name (and price, for those who may set it) once; after
 * that it is a known product. This is a screen of its own, not a popup: Back returns to the list.
 */
export default function ScanPanel({cafeteriaId, language, onBack, onChanged}: {cafeteriaId: string; language: 'ar' | 'en'; onBack: () => void; onChanged: () => void}) {
  const en = language === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const [current, setCurrent] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(FUSHATI_CATEGORIES[4].id);
  const [price, setPrice] = useState('');
  const request = useRef<string>('');

  async function lookup(code: string) {
    setLooking(true);
    setError('');
    try {
      const response = await fetch('/api/fushati/inventory?' + new URLSearchParams({op: 'barcode', cafeteriaId, code}), {cache: 'no-store'});
      const body = (await response.json()) as Found;
      if (!response.ok) throw new Error(body.error || t('تعذر البحث عن الباركود', 'Could not look the barcode up'));
      request.current = crypto.randomUUID();
      setQuantity(''); setCost(''); setName(''); setPrice('');
      setCurrent(body);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t('تعذر البحث عن الباركود', 'Could not look the barcode up'));
    } finally {
      setLooking(false);
    }
  }

  function cancel() {
    setCurrent(null);
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!current || saving) return;
    setError('');
    const units = quantity.trim() === '' ? 0 : quantityInput(quantity);
    if (units === null) { setError(t('الكمية رقم صحيح من 1 إلى 100000.', 'The quantity is a whole number from 1 to 100000.')); return; }
    const costText = amountInput(cost);
    if (costText === null) { setError(t('سعر التكلفة غير صحيح.', 'The cost price is not valid.')); return; }
    if (current.found && units === 0) { setError(t('اكتب الكمية المستلمة.', 'Enter the quantity received.')); return; }
    if (!current.found) {
      const problem = newProductProblem({name, price, canPrice: current.can.price}, en);
      if (problem) { setError(problem); return; }
    }
    setSaving(true);
    try {
      const response = await fetch('/api/fushati/inventory', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({op: 'scan', data: {
          cafeteriaId, barcode: current.barcode, quantity: units, requestId: request.current,
          ...(costText ? {cost: costText} : {}),
          ...(current.found ? {} : {product: {name: name.trim(), category, ...(current.can.price && price.trim() ? {price: amountInput(price)} : {})}}),
        }}),
      });
      const body = (await response.json()) as SavedBody;
      if (!response.ok) {
        if (body.code === 'stock_forbidden' && body.created) {
          // The product itself was added; only the stock was not allowed.
          setSaved((lines) => [`${body.name}: ${body.error}`, ...lines].slice(0, 6));
          setCurrent(null);
          onChanged();
          return;
        }
        throw new Error(body.error || t('تعذر الحفظ', 'Could not save'));
      }
      setSaved((lines) => [savedMessage(body, en), ...lines].slice(0, 6));
      setCurrent(null);
      onChanged();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t('تعذر الحفظ', 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  const item = current?.item || null;
  const typed = !!current && (quantity.trim() !== '' || name.trim() !== '' || price.trim() !== '' || cost.trim() !== '');
  const canSave = !!current && (current.found ? current.can.stock : current.can.create);

  return <EditorView
    title={t('مسح منتج بالباركود', 'Scan a product')}
    description={t('امسح الباركود الموجود على المنتج. المنتج المسجّل يحتاج الكمية فقط؛ والباركود الجديد يُسجَّل مرة واحدة باسمه.', 'Scan the barcode printed on the item. A product that is already registered needs only the quantity; a new barcode is registered once, with its name.')}
    icon={<ScanBarcode size={26}/>} tone="amber" tourId="cfa-product-scan"
    onBack={onBack} backLabel={t('رجوع إلى المنتجات', 'Back to products')}
    dirty={typed} dirtyMessage={t('لم تحفظ ما كتبته. هل تتجاهله وتخرج؟', 'You have not saved what you typed. Discard it and leave?')}
    keepLabel={t('متابعة', 'Keep going')} discardLabel={t('تجاهل والخروج', 'Discard and leave')}
    actions={current ? <>
      <button type="submit" form="cfs-form" className="kx-btn is-solid" disabled={saving || !canSave}>
        {saving ? t('جارٍ الحفظ…', 'Saving…') : <><Check size={18} aria-hidden="true"/>{current.found ? t('إضافة الكمية للمخزون', 'Add to stock') : t('حفظ المنتج', 'Save product')}</>}
      </button>
      <button type="button" className="kx-btn" disabled={saving} onClick={cancel}><X size={18} aria-hidden="true"/>{t('إلغاء هذا المنتج', 'Cancel this item')}</button>
    </> : <button type="button" className="kx-btn" onClick={onBack}><Check size={18} aria-hidden="true"/>{t('تم', 'Done')}</button>}>
    <div className="cfs-stack">
      {saved.length > 0 && <div className="cfs-saved" role="status" aria-live="polite">
        <strong><Check size={16} aria-hidden="true"/> {t('تم الحفظ', 'Saved')}</strong>
        <ul>{saved.map((line, index) => <li key={index + line}>{line}</li>)}</ul>
      </div>}
      <BarcodeCapture language={language} onCode={lookup} paused={!!current || looking || saving}/>
      {looking && <p className="cfs-looking" role="status">{t('جارٍ البحث…', 'Looking it up…')}</p>}
      {error && <Notice tone="red" role="alert">{error}</Notice>}

      {current && <form id="cfs-form" onSubmit={save} className="cfs-result">
        {item ? <Card tone="green" icon={<PackageCheck size={18}/>} title={item.name} description={`${t('هذا المنتج مسجّل. اكتب الكمية المستلمة فقط.', 'This product is registered. Enter only the quantity received.')}`}>
          <dl className="cfs-facts">
            <div><dt>{t('الباركود', 'Barcode')}</dt><dd dir="ltr">{current.barcode}</dd></div>
            <div><dt>{t('السعر', 'Price')}</dt><dd>{item.priceMinor > 0 ? `${money(item.priceMinor)} SAR` : t('لم يُحدد', 'Not set')}</dd></div>
            {current.can.viewStock && <div><dt>{t('المتوفر الآن', 'In stock now')}</dt><dd>{item.onHand ?? 0}</dd></div>}
            {current.can.viewStock && <div><dt>{t('الحالة', 'Status')}</dt><dd><Badge tone={statusTone(stockStatus(item))}>{statusLabel(stockStatus(item), en)}</Badge></dd></div>}
          </dl>
          {current.can.stock
            ? <div className="cfs-qty">
              <label className="kx-field"><span>{t('الكمية المستلمة', 'Quantity received')}</span>
                <input className="kx-input cfs-qty-input" inputMode="numeric" autoFocus autoComplete="off" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="24"/>
              </label>
              <details className="cfs-more"><summary>{t('سعر التكلفة للوحدة (اختياري)', 'Cost price per unit (optional)')}</summary>
                <label className="kx-field"><span>{t('بالريال', 'In riyals')}</span>
                  <input className="kx-input" inputMode="decimal" autoComplete="off" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="1.25"/>
                </label>
              </details>
            </div>
            : <Notice tone="amber" icon={<X size={18}/>} title={t('لا يمكنك تغيير المخزون', 'You cannot change the stock')}>
              {t('اطلب من مدير المقصف أن يمنحك صلاحية «إدارة المخزون».', 'Ask the cafeteria administrator to give you the “Manage inventory” permission.')}
            </Notice>}
        </Card>
          : <Card tone="amber" icon={<PackagePlus size={18}/>} title={t('باركود جديد', 'New barcode')}
            description={t('هذا الباركود غير مسجّل في هذا المقصف. اكتب اسم المنتج مرة واحدة، وفي المرات القادمة يكفي مسحه وكتابة الكمية.', 'This barcode is not registered in this cafeteria yet. Enter the product name once; from then on you only scan it and enter the quantity.')}>
            {current.can.create ? <div className="cfs-newfields">
              <label className="kx-field cfs-wide"><span>{t('اسم المنتج', 'Product name')}</span>
                <input className="kx-input" required autoFocus autoComplete="off" value={name} onChange={(event) => setName(event.target.value)}/>
              </label>
              <label className="kx-field"><span>{t('التصنيف', 'Category')}</span>
                <select className="kx-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {FUSHATI_CATEGORIES.map((option) => <option key={option.id} value={option.id}>{en ? option.en : option.id}</option>)}
                </select>
              </label>
              <label className="kx-field"><span>{t('الباركود', 'Barcode')}</span>
                <input className="kx-input" dir="ltr" readOnly value={current.barcode}/>
              </label>
              {current.can.price
                ? <label className="kx-field"><span>{t('سعر البيع (ر.س)', 'Selling price (SAR)')}</span>
                  <input className="kx-input" inputMode="decimal" autoComplete="off" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="2.50"/>
                </label>
                : <p className="cfi-hint cfs-wide">{t('سعر البيع يحدده مدير المقصف ثم يعتمد المنتج قبل بيعه.', 'The cafeteria administrator sets the selling price and approves the product before it is sold.')}</p>}
              {current.can.stock && <>
                <label className="kx-field"><span>{t('الكمية المستلمة (اختياري)', 'Quantity received (optional)')}</span>
                  <input className="kx-input cfs-qty-input" inputMode="numeric" autoComplete="off" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="24"/>
                </label>
                <label className="kx-field"><span>{t('سعر التكلفة للوحدة (اختياري)', 'Cost price per unit (optional)')}</span>
                  <input className="kx-input" inputMode="decimal" autoComplete="off" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="1.25"/>
                </label>
              </>}
            </div> : <Notice tone="amber" title={t('لا يمكنك إضافة منتجات', 'You cannot add products')}>{t('اطلب من مدير المقصف صلاحية اقتراح المنتجات.', 'Ask the cafeteria administrator for the permission to propose products.')}</Notice>}
          </Card>}
      </form>}
    </div>
  </EditorView>;
}
