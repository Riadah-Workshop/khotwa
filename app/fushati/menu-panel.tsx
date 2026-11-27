'use client';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Barcode, Camera, Check, PackagePlus, Pencil, Plus, ScanBarcode, Search, ShoppingBasket, Trash2} from 'lucide-react';
import '../ui/kx.css';
import './panels.css';
import {Badge, Card, ConfirmButton, Empty, EditorView, Notice, cx} from '../ui/kx';
import type {Tone} from '../ui/kx';
import {FUSHATI_CATEGORIES, categoryEnglish} from '../../lib/fushati/categories';
import {barcodeMessage, barcodeProblem, normalizeBarcode} from '../../lib/fushati/barcode';
import BarcodeCapture from './barcode-capture';
import ScanPanel from './scan-panel';
import {amountInput, filterProducts, productState} from './scan-ui';
import type {ProductFilter} from './scan-ui';
import {money} from './stock-ui';

export type MenuRow = {id: string; cafeteria_id: string; name: string; category: string; price_minor: number; active: number; available: number; stock_tracked: number; stock_qty: number; low_stock_threshold: number; barcode?: string | null};
type Editing = {id: string; name: string; category: string; price: string; barcode: string; status: 'sale' | 'off' | 'hidden'};
type Reply = {error?: string};

const STATE: Record<Exclude<ProductFilter, 'all'>, {tone: Tone; ar: string; en: string}> = {
  sale: {tone: 'green', ar: 'متاح للبيع', en: 'On sale'},
  off: {tone: 'amber', ar: 'غير متوفر الآن', en: 'Unavailable now'},
  pending: {tone: 'blue', ar: 'غير معتمد', en: 'Not approved'},
};

async function send(op: string, data: unknown): Promise<Reply> {
  const response = await fetch('/api/fushati', {method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', body: JSON.stringify({op, data})});
  const body = (await response.json().catch(() => ({}))) as Reply;
  if (!response.ok) throw new Error(body.error || 'تعذر الحفظ');
  return body;
}

/**
 * The products of one cafeteria: the list, adding and changing a product, and scanning barcodes. Adding, changing
 * and scanning open as screens of their own in place of the list (Back returns), never as popups.
 */
export default function MenuPanel({mode, language, cafeteriaId, items, canManage, canPropose, canViewStock, view, onView, onFocus, onSaved, onChanged}: {
  mode: 'admin' | 'agent'; language: 'ar' | 'en'; cafeteriaId: string; items: MenuRow[];
  canManage: boolean; canPropose: boolean; canViewStock: boolean;
  view: 'list' | 'scan'; onView: (view: 'list' | 'scan') => void; onFocus: (on: boolean) => void; onSaved: (message: string) => void; onChanged: () => void;
}) {
  const en = language === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [original, setOriginal] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [camera, setCamera] = useState(false);
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorBox.current?.scrollIntoView({block: 'center', behavior: 'smooth'}); }, [error]);
  // While a product is being added, changed or scanned the page shows only that screen; tell the page so it can hide the tabs.
  const focused = !!editing || view === 'scan';
  useEffect(() => { onFocus(focused); return () => onFocus(false); }, [focused, onFocus]);

  const canAdd = canManage || canPropose;
  const rows = items.map((item) => ({...item, barcode: item.barcode || null}));
  const shown = filterProducts(rows, search, filter);
  const count = (which: ProductFilter) => which === 'all' ? rows.length : rows.filter((row) => productState(row) === which).length;

  function openNew() {
    const blank: Editing = {id: '', name: '', category: FUSHATI_CATEGORIES[0].id, price: '', barcode: '', status: 'sale'};
    setEditing(blank); setOriginal(JSON.stringify(blank)); setError(''); setCamera(false);
  }
  function openEdit(row: MenuRow) {
    const next: Editing = {id: row.id, name: row.name, category: row.category, price: row.price_minor ? String(row.price_minor / 100) : '', barcode: row.barcode || '', status: !row.active ? (row.price_minor > 0 ? 'hidden' : 'sale') : row.available ? 'sale' : 'off'};
    setEditing(next); setOriginal(JSON.stringify(next)); setError(''); setCamera(false);
  }
  const closeEditor = () => { setEditing(null); setError(''); setCamera(false); };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    const code = normalizeBarcode(editing.barcode);
    const problem = code ? barcodeProblem(code) : null;
    if (problem) { setError(barcodeMessage(problem, language)); return; }
    const price = amountInput(editing.price);
    if (canManage && price === null) { setError(t('السعر غير صحيح. استخدم أرقاماً مثل 2.50.', 'The price is not valid. Use numbers such as 2.50.')); return; }
    if (canManage && editing.id && editing.status === 'sale' && !(Number(price) > 0)) { setError(t('حدد سعراً أكبر من صفر قبل جعل المنتج متاحاً للبيع.', 'Set a price above zero before putting the product on sale.')); return; }
    setSaving(true); setError('');
    try {
      if (!editing.id) {
        await send('create-menu', {cafeteriaId, name: editing.name.trim(), category: editing.category, ...(canManage ? {price: price || '0'} : {}), ...(code ? {barcode: code} : {})});
        closeEditor();
        onSaved(!canManage || !(Number(price) > 0) ? t('تمت إضافة المنتج بانتظار تسعيره واعتماده', 'Product added; it waits for a price and approval') : t('تمت إضافة المنتج', 'Product added'));
      } else {
        await send('edit-menu', {id: editing.id, name: editing.name.trim(), category: editing.category, price: price || '0', active: editing.status !== 'hidden', available: editing.status === 'sale', barcode: code});
        closeEditor();
        onSaved(t('تم حفظ المنتج', 'Product saved'));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('تعذر الحفظ', 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing?.id || saving) return;
    setSaving(true); setError('');
    try {
      await send('delete-menu', {id: editing.id});
      closeEditor();
      onSaved(t('تم حذف المنتج', 'Product deleted'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('تعذر الحذف', 'Could not delete'));
    } finally {
      setSaving(false);
    }
  }

  if (view === 'scan') return <ScanPanel cafeteriaId={cafeteriaId} language={language} onBack={() => onView('list')} onChanged={onChanged}/>;

  if (editing) {
    const isNew = !editing.id;
    const set = (patch: Partial<Editing>) => setEditing({...editing, ...patch});
    return <EditorView
      title={isNew ? t('إضافة منتج', 'Add a product') : t('تعديل المنتج', 'Edit product')}
      description={isNew
        ? (canManage ? t('اكتب بيانات المنتج. يمكنك مسح الباركود بالقارئ أو الكاميرا.', 'Enter the product details. You can scan the barcode with a scanner or the camera.') : t('اقترح منتجاً جديداً؛ يحدد المدير سعره ويعتمده قبل عرضه للبيع.', 'Suggest a new product; the administrator sets its price and approves it before it is sold.'))
        : t('غيّر البيانات ثم احفظ. يمكنك أيضاً إيقاف بيع المنتج أو حذفه.', 'Change the details and save. You can also stop selling the product or delete it.')}
      icon={isNew ? <PackagePlus size={26}/> : <Pencil size={26}/>} tone="amber" tourId="cfa-product-form"
      onBack={closeEditor} backLabel={t('رجوع إلى المنتجات', 'Back to products')}
      dirty={JSON.stringify(editing) !== original} dirtyMessage={t('لم تحفظ التعديلات. هل تتجاهلها وتخرج؟', 'You have unsaved changes. Discard them and leave?')}
      keepLabel={t('متابعة التعديل', 'Keep editing')} discardLabel={t('تجاهل والخروج', 'Discard and leave')}
      actions={<>
        <button type="submit" form="cfm-form" className="kx-btn is-solid" disabled={saving}><Check size={18} aria-hidden="true"/>{saving ? t('جارٍ الحفظ…', 'Saving…') : isNew ? t('إضافة المنتج', 'Add product') : t('حفظ', 'Save')}</button>
        <button type="button" className="kx-btn" disabled={saving} onClick={closeEditor}>{t('إلغاء', 'Cancel')}</button>
        {!isNew && canManage && <span className="cfm-danger"><ConfirmButton label={t('حذف المنتج', 'Delete product')} icon={<Trash2 size={16} aria-hidden="true"/>}
          message={t('حذف هذا المنتج نهائياً؟ لا يُحذف منتج سبق بيعه.', 'Delete this product for good? A product that was already sold cannot be deleted.')}
          confirmLabel={t('نعم، احذف', 'Yes, delete')} cancelLabel={t('لا', 'No')} disabled={saving} onConfirm={remove}/></span>}
      </>}>
      <form id="cfm-form" onSubmit={save} className="cfm-form">
        <div ref={errorBox}>{error && <Notice tone="red" role="alert">{error}</Notice>}</div>
        <label className="kx-field cfm-wide"><span>{t('اسم المنتج', 'Product name')}</span>
          <input className="kx-input" required minLength={2} maxLength={140} autoFocus autoComplete="off" value={editing.name} onChange={(event) => set({name: event.target.value})}/>
        </label>
        <label className="kx-field"><span>{t('التصنيف', 'Category')}</span>
          <select className="kx-select" value={editing.category} onChange={(event) => set({category: event.target.value})}>
            {!FUSHATI_CATEGORIES.some((option) => option.id === editing.category) && <option value={editing.category}>{editing.category}</option>}
            {FUSHATI_CATEGORIES.map((option) => <option key={option.id} value={option.id}>{en ? option.en : option.id}</option>)}
          </select>
        </label>
        {canManage && <label className="kx-field"><span>{t('سعر البيع (ر.س)', 'Selling price (SAR)')}</span>
          <input className="kx-input" inputMode="decimal" autoComplete="off" value={editing.price} onChange={(event) => set({price: event.target.value})} placeholder="2.50"/>
        </label>}
        <div className="kx-field cfm-wide">
          <label htmlFor="cfm-barcode"><span>{t('الباركود (اختياري)', 'Barcode (optional)')}</span></label>
          <div className="cfm-barcode-row">
            <input id="cfm-barcode" className="kx-input" dir="ltr" autoComplete="off" spellCheck={false} value={editing.barcode} placeholder="6281000000000" onChange={(event) => set({barcode: event.target.value})}/>
            <button type="button" className="kx-btn" onClick={() => setCamera(!camera)}><Camera size={18} aria-hidden="true"/>{camera ? t('إخفاء الكاميرا', 'Hide camera') : t('مسح بالكاميرا', 'Scan with camera')}</button>
          </div>
          <small className="cfi-hint">{t('إن وُجد الباركود يكفي مسحه لاحقاً وكتابة الكمية عند استلام البضاعة.', 'With a barcode, receiving stock later is just a scan and a quantity.')}</small>
          {camera && <BarcodeCapture language={language} paused={false} label={t('وجّه الكاميرا إلى الباركود، أو اكتبه هنا', 'Point the camera at the barcode, or type it here')} onCode={(code) => { set({barcode: code}); setCamera(false); }}/>}
        </div>
        {!isNew && canManage && <label className="kx-field cfm-wide"><span>{t('حالة المنتج', 'Product status')}</span>
          <select className="kx-select" value={editing.status} onChange={(event) => set({status: event.target.value as Editing['status']})}>
            <option value="sale">{t('متاح للبيع', 'On sale')}</option>
            <option value="off">{t('غير متوفر الآن (يظهر ولا يُباع)', 'Unavailable for now')}</option>
            <option value="hidden">{t('غير معتمد / موقوف', 'Not approved / stopped')}</option>
          </select>
        </label>}
      </form>
    </EditorView>;
  }

  const filters: Array<{id: ProductFilter; ar: string; en: string}> = [
    {id: 'all', ar: 'الكل', en: 'All'}, {id: 'sale', ar: 'متاحة', en: 'On sale'}, {id: 'pending', ar: 'غير معتمدة', en: 'Not approved'}, {id: 'off', ar: 'غير متوفرة', en: 'Unavailable'},
  ];
  return <div className="cfm-root" data-tour="cfa-menu">
    <Card tone="amber" icon={<ScanBarcode size={18}/>} title={canAdd ? t('أضف منتجاً', 'Add a product') : t('المنتجات', 'Products')}
      description={mode === 'agent' ? t('امسح باركود المنتج لإضافته أو لتسجيل كميته. المنتج الجديد يعتمده المدير قبل بيعه.', 'Scan a product’s barcode to add it or record its quantity. The administrator approves a new product before it is sold.') : t('امسح باركود المنتج لتسجيل كميته، أو أضف منتجاً جديداً بياناته مرة واحدة.', 'Scan a product’s barcode to record its quantity, or add a new product once.')}>
      {canAdd ? <div className="cfm-actions">
        <button type="button" className="kx-btn is-solid" data-tone="amber" onClick={() => onView('scan')} data-tour="cfa-scan-button"><ScanBarcode size={18} aria-hidden="true"/>{t('مسح منتج بالباركود', 'Scan a product')}</button>
        <button type="button" className="kx-btn" onClick={openNew}><Plus size={18} aria-hidden="true"/>{t('إضافة منتج يدوياً', 'Add manually')}</button>
      </div> : <Notice tone="slate" title={t('عرض فقط', 'View only')}>{t('ليست لديك صلاحية إضافة منتجات في هذا المقصف.', 'You do not have permission to add products in this cafeteria.')}</Notice>}
    </Card>
    <Card tone="green" icon={<ShoppingBasket size={18}/>} title={t('قائمة منتجات المقصف', 'Cafeteria products')} description={t('الأسعار والحالة والباركود لكل منتج.', 'Price, status and barcode of every product.')}>
      <div className="cfi-filters">
        <div className="cfi-chips" role="group" aria-label={t('تصفية المنتجات', 'Filter products')}>
          {filters.map((option) => <button key={option.id} type="button" className={cx('kx-btn', 'is-small', filter === option.id && 'is-solid')} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{en ? option.en : option.ar} <b>{count(option.id)}</b></button>)}
        </div>
        <label className="kx-field cfi-search"><span className="kx-sr">{t('بحث عن منتج', 'Search products')}</span>
          <span className="cfi-search-box"><Search size={16} aria-hidden="true"/><input className="kx-input" type="search" value={search} placeholder={t('اسم المنتج أو الباركود…', 'Product name or barcode…')} onChange={(event) => setSearch(event.target.value)}/></span>
        </label>
      </div>
      {shown.length === 0
        ? <Empty icon={<ShoppingBasket size={22}/>}>{rows.length === 0 ? t('لا توجد منتجات بعد. امسح باركود أول منتج لإضافته.', 'No products yet. Scan the barcode of the first product to add it.') : t('لا يوجد منتج يطابق بحثك.', 'No product matches your search.')}</Empty>
        : <div className="cfm-items">
          {shown.map((row) => {
            const state = productState(row);
            return <article key={row.id} className="cfm-item" data-state={state}>
              <header>
                <div><strong>{row.name}</strong><small>{en ? categoryEnglish(row.category) : row.category}</small></div>
                <Badge tone={STATE[state].tone}>{en ? STATE[state].en : STATE[state].ar}</Badge>
              </header>
              <dl className="cfm-facts">
                <div><dt>{t('السعر', 'Price')}</dt><dd>{row.price_minor > 0 ? `${money(row.price_minor)} SAR` : t('لم يُحدد', 'Not set')}</dd></div>
                <div className="cfm-code"><dt>{t('الباركود', 'Barcode')}</dt><dd dir="ltr">{row.barcode ? <><Barcode size={13} aria-hidden="true"/> {row.barcode}</> : '—'}</dd></div>
                {canViewStock && <div><dt>{t('المتوفر', 'In stock')}</dt><dd>{row.stock_tracked ? row.stock_qty : '—'}</dd></div>}
              </dl>
              {canManage && <footer><button type="button" className="kx-btn is-small" onClick={() => openEdit(row)}><Pencil size={15} aria-hidden="true"/>{state === 'pending' && row.price_minor === 0 ? t('تسعير واعتماد', 'Price and approve') : t('تعديل', 'Edit')}</button></footer>}
            </article>;
          })}
        </div>}
    </Card>
  </div>;
}
