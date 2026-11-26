'use client';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';
import {Boxes, Check, ClipboardList, Clock, History, PackagePlus, RefreshCw, Search, Settings, Trash2, TriangleAlert, Undo2, Warehouse, X} from 'lucide-react';
import '../ui/kx.css';
import './panels.css';
import {Badge, Card, Empty, Notice, Stat, cx} from '../ui/kx';
import type {Tone} from '../ui/kx';
import {MOVE_KINDS, afterMove, costInput, daysOfCover, money, moveProblem, movementLabel, saudiTime, sortForAttention, statusLabel, statusTone, summarize} from './stock-ui';
import type {Movement, MoveKind, StockItem} from './stock-ui';

type ItemsState = {key: string; cafeteriaId: string; items: StockItem[]; canManage: boolean; error: string};
type HistoryState = {key: string; movements: Movement[]; error: string};
type Editing = {id: string; mode: MoveKind | 'setup'; requestId: string};
type Filter = 'all' | 'attention' | 'untracked';

const KIND_ICONS: Record<MoveKind, ReactNode> = {
  receipt: <PackagePlus size={18}/>, return: <Undo2 size={18}/>, waste: <Trash2 size={18}/>, damage: <TriangleAlert size={18}/>, expired: <Clock size={18}/>, stocktake: <ClipboardList size={18}/>,
};

async function post(op: string, data: unknown) {
  const res = await fetch('/api/fushati/inventory', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op, data})});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export default function InventoryPanel({cafeteriaId, language}: {cafeteriaId: string; language: 'ar' | 'en'}) {
  const en = language === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ItemsState | null>(null);
  const [days, setDays] = useState(30);
  const [menuFilter, setMenuFilter] = useState('');
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [threshold, setThreshold] = useState('0');
  const [tracked, setTracked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{tone: Tone; text: string} | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const itemsKey = `${cafeteriaId}|${reload}`;
  const historyKey = `${cafeteriaId}|${reload}|${days}|${menuFilter}`;
  const loading = !!cafeteriaId && (!state || state.key !== itemsKey);
  const current = state && state.cafeteriaId === cafeteriaId ? state : null;
  const items = current?.items || [];
  const canManage = !!current?.canManage;

  useEffect(() => {
    if (!cafeteriaId) return;
    let live = true;
    fetch('/api/fushati/inventory?' + new URLSearchParams({op: 'items', cafeteriaId}), {cache: 'no-store'})
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Request failed'); return body; })
      .then(body => { if (live) setState({key: itemsKey, cafeteriaId, items: body.items || [], canManage: !!body.canManage, error: ''}); })
      .catch(e => { if (live) setState(previous => ({key: itemsKey, cafeteriaId, items: previous?.cafeteriaId === cafeteriaId ? previous.items : [], canManage: false, error: e instanceof Error ? e.message : String(e)})); });
    return () => { live = false; };
  }, [cafeteriaId, itemsKey]);

  useEffect(() => {
    if (!cafeteriaId) return;
    let live = true;
    const query = new URLSearchParams({op: 'history', cafeteriaId, days: String(days)});
    if (menuFilter) query.set('menuId', menuFilter);
    fetch('/api/fushati/inventory?' + query.toString(), {cache: 'no-store'})
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Request failed'); return body; })
      .then(body => { if (live) setHistory({key: historyKey, movements: body.movements || [], error: ''}); })
      .catch(e => { if (live) setHistory({key: historyKey, movements: [], error: e instanceof Error ? e.message : String(e)}); });
    return () => { live = false; };
  }, [cafeteriaId, days, menuFilter, historyKey]);

  function open(item: StockItem, mode: MoveKind | 'setup') {
    setMessage(null);
    setQuantity('');
    setNote('');
    setCost(item.costMinor === null ? '' : (item.costMinor / 100).toFixed(2));
    setThreshold(String(item.threshold));
    setTracked(true);
    setEditing({id: item.id, mode, requestId: crypto.randomUUID()});
    window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 60);
  }

  async function submit(event: FormEvent, item: StockItem) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editing.mode === 'setup') {
        const amount = costInput(cost);
        if (amount === null) throw new Error(t('سعر التكلفة غير صحيح', 'The cost price is not a valid amount'));
        const limit = Number(threshold);
        if (!Number.isInteger(limit) || limit < 0) throw new Error(t('حد التنبيه يجب أن يكون رقماً صحيحاً', 'The warning level must be a whole number'));
        await post('setup', {menuId: item.id, tracked, threshold: limit, ...(amount === '' ? {} : {cost: amount})});
        setMessage({tone: 'green', text: tracked ? t('تم حفظ إعدادات المخزون', 'Stock settings saved') : t('أُوقف تتبع هذا المنتج', 'Tracking stopped for this item')});
      } else {
        const count = Number(quantity);
        const problem = moveProblem(item.onHand, editing.mode, count);
        if (problem === 'quantity') throw new Error(t('أدخل كمية صحيحة', 'Enter a valid quantity'));
        if (problem === 'insufficient') throw new Error(t('الكمية أكبر من المتوفر', 'That is more than is on hand'));
        const amount = editing.mode === 'receipt' ? costInput(cost) : '';
        if (amount === null) throw new Error(t('سعر التكلفة غير صحيح', 'The cost price is not a valid amount'));
        const result = await post('move', {menuId: item.id, kind: editing.mode, quantity: count, note: note.trim(), requestId: editing.requestId, ...(amount ? {cost: amount} : {})});
        setMessage({tone: 'green', text: t(`تم التسجيل. المتوفر الآن: ${result.onHand}`, `Recorded. On hand now: ${result.onHand}`)});
      }
      setEditing(null);
      setReload(n => n + 1);
    } catch (e) {
      setMessage({tone: 'red', text: e instanceof Error ? e.message : String(e)});
    } finally {
      setBusy(false);
    }
  }

  if (!cafeteriaId) return <Card tone="teal" icon={<Warehouse size={18}/>} title={t('المخزون', 'Inventory')} tourId="cfa-inventory"><Empty icon={<Warehouse size={24}/>}>{t('اختر مقصفاً لعرض مخزونه.', 'Choose a cafeteria to see its stock.')}</Empty></Card>;

  const summary = summarize(items);
  const shown = sortForAttention(items).filter(item => {
    if (filter === 'attention' && item.status !== 'low' && item.status !== 'out') return false;
    if (filter === 'untracked' && item.tracked) return false;
    return !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const attention = summary.low + summary.out;
  const kind = editing && editing.mode !== 'setup' ? MOVE_KINDS.find(entry => entry.kind === editing.mode) : null;

  return <div className="kx-grid" data-tour="cfa-inventory">
    {current?.error && <Notice tone="red" icon={<X size={18}/>} role="alert">{current.error}</Notice>}
    {message && <Notice tone={message.tone} icon={message.tone === 'green' ? <Check size={18}/> : <X size={18}/>} role={message.tone === 'red' ? 'alert' : 'status'}>{message.text}</Notice>}
    {current && !canManage && !current.error && <Notice tone="blue" icon={<Warehouse size={18}/>}>{t('لديك صلاحية عرض المخزون فقط. لتسجيل الاستلام أو الهدر أو الجرد اطلب صلاحية «إدارة المخزون».', 'You can view the stock only. To record deliveries, waste or counts, ask for the "Manage inventory" permission.')}</Notice>}

    <div className="kx-grid cols-4 keep-2" data-tour="cfa-inventory-stats">
      <Stat icon={<Boxes size={22}/>} tone="teal" label={t('منتجات متتبعة', 'Tracked items')} value={summary.tracked} hint={summary.untracked ? t(`${summary.untracked} غير متتبع`, `${summary.untracked} not tracked`) : undefined}/>
      <Stat icon={<TriangleAlert size={22}/>} tone={summary.low ? 'amber' : 'slate'} label={t('مخزون منخفض', 'Low stock')} value={summary.low}/>
      <Stat icon={<X size={22}/>} tone={summary.out ? 'red' : 'slate'} label={t('نفدت', 'Out of stock')} value={summary.out}/>
      <Stat icon={<Warehouse size={22}/>} tone="green" label={t('قيمة المخزون', 'Stock value')} value={<>{money(summary.valueMinor)} <small>{t('ر.س', 'SAR')}</small></>} hint={summary.withoutCost ? t(`${summary.withoutCost} منتج بلا سعر تكلفة`, `${summary.withoutCost} item(s) without a cost`) : t('بسعر التكلفة', 'At cost price')}/>
    </div>

    <Card tone="teal" icon={<Warehouse size={18}/>} title={t('المنتجات والكميات', 'Items and quantities')} description={t('الأحوج إلى إجراء أولاً. المنتجات التي لا تُتبع كميتها تبقى متاحة للبيع دون قيد.', 'Items that need action come first. Items without tracking stay available for sale without a limit.')}
      actions={<button type="button" className="kx-btn is-small" onClick={() => setReload(n => n + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'kx-spin' : undefined}/><span className="kx-btn-text">{t('تحديث', 'Refresh')}</span></button>}>
      <div className="cfi-filters">
        <div className="cfi-chips" role="group" aria-label={t('تصفية المنتجات', 'Filter items')}>
          {([['all', t('الكل', 'All'), items.length], ['attention', t('يحتاج إجراء', 'Needs action'), attention], ['untracked', t('غير متتبع', 'Not tracked'), summary.untracked]] as Array<[Filter, string, number]>).map(([id, label, count]) =>
            <button key={id} type="button" className={cx('kx-btn is-small', filter === id && 'is-solid')} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <b>{count}</b></button>)}
        </div>
        <label className="kx-field cfi-search"><span className="kx-sr">{t('بحث عن منتج', 'Search items')}</span>
          <span className="cfi-search-box"><Search size={16} aria-hidden="true"/><input className="kx-input" type="search" value={search} placeholder={t('ابحث عن منتج…', 'Search items…')} onChange={e => setSearch(e.target.value)}/></span>
        </label>
      </div>

      {loading && !current && <Empty icon={<RefreshCw size={24}/>}>{t('جارٍ تحميل المخزون…', 'Loading the stock…')}</Empty>}
      {current && items.length === 0 && !current.error && <Empty icon={<Boxes size={24}/>}>{t('لا توجد منتجات في هذا المقصف بعد. أضف منتجات من تبويب «المنتجات» أولاً.', 'This cafeteria has no items yet. Add items in the Products tab first.')}</Empty>}
      {current && items.length > 0 && shown.length === 0 && <Empty icon={<Search size={24}/>}>{t('لا يوجد منتج يطابق التصفية.', 'No item matches the filter.')}</Empty>}

      <div className="cfi-items">
        {shown.map(item => {
          const cover = daysOfCover(item);
          const isEditing = editing?.id === item.id;
          return <article key={item.id} className="cfi-item" data-status={item.status}>
            <header>
              <div><strong>{item.name}</strong><small>{item.category}</small></div>
              <Badge tone={statusTone(item.status)} icon={item.status === 'ok' ? <Check size={14}/> : item.status === 'untracked' ? undefined : <TriangleAlert size={14}/>}>{statusLabel(item.status, en)}</Badge>
            </header>
            <dl className="cfi-facts">
              <div><dt>{t('المتوفر', 'On hand')}</dt><dd className="cfi-onhand">{item.tracked ? item.onHand : '—'}</dd></div>
              <div><dt>{t('حد التنبيه', 'Warning at')}</dt><dd>{item.tracked ? item.threshold : '—'}</dd></div>
              <div><dt>{t('مباع (٣٠ يوماً)', 'Sold (30 days)')}</dt><dd>{item.sold30d}</dd></div>
              <div><dt>{t('يكفي نحو', 'Lasts about')}</dt><dd>{cover === null ? '—' : t(`${cover} يوم`, `${cover} days`)}</dd></div>
              <div><dt>{t('سعر التكلفة', 'Cost price')}</dt><dd>{item.costMinor === null ? '—' : money(item.costMinor)}</dd></div>
              <div><dt>{t('سعر البيع', 'Sale price')}</dt><dd>{money(item.priceMinor)}</dd></div>
            </dl>
            {canManage && !isEditing && <div className="kx-btn-row cfi-actions">
              {item.tracked && MOVE_KINDS.map(entry => <button key={entry.kind} type="button" className="kx-btn is-small is-soft" data-tone={entry.tone} onClick={() => open(item, entry.kind)}>{KIND_ICONS[entry.kind]}{entry.label[language]}</button>)}
              <button type="button" className="kx-btn is-small" onClick={() => open(item, 'setup')}><Settings size={16}/>{item.tracked ? t('إعدادات التتبع', 'Tracking settings') : t('بدء تتبع الكمية', 'Start tracking')}</button>
            </div>}
            {isEditing && editing && <form ref={formRef} className="cfi-form" onSubmit={event => submit(event, item)}>
              {editing.mode === 'setup' ? <>
                <label className="kx-check"><input type="checkbox" checked={tracked} onChange={e => setTracked(e.target.checked)}/>{t('تتبّع كمية هذا المنتج', 'Track the quantity of this item')}</label>
                <div className="kx-form-grid">
                  <label className="kx-field">{t('حد التنبيه (تحذير عند الوصول إليه)', 'Warning level (warn at or below)')}<input className="kx-input" type="number" min={0} max={100000} step={1} inputMode="numeric" value={threshold} onChange={e => setThreshold(e.target.value)}/></label>
                  <label className="kx-field">{t('سعر تكلفة الوحدة (ر.س)', 'Unit cost price (SAR)')}<input className="kx-input" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00"/></label>
                </div>
              </> : kind && <>
                <p className="cfi-hint"><span data-tone={kind.tone} className="cfi-kind">{KIND_ICONS[kind.kind]}{kind.label[language]}</span> {kind.hint[language]}</p>
                <div className="kx-form-grid">
                  <label className="kx-field">{kind.effect === 'count' ? t('الكمية المعدودة فعلاً', 'Quantity counted') : t('الكمية', 'Quantity')}<input className="kx-input" type="number" min={kind.effect === 'count' ? 0 : 1} max={100000} step={1} inputMode="numeric" required value={quantity} onChange={e => setQuantity(e.target.value)}/></label>
                  {kind.kind === 'receipt' && <label className="kx-field">{t('سعر تكلفة الوحدة (اختياري)', 'Unit cost (optional)')}<input className="kx-input" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00"/></label>}
                  <label className="kx-field cfi-wide">{t('ملاحظة (اختياري)', 'Note (optional)')}<input className="kx-input" maxLength={200} value={note} onChange={e => setNote(e.target.value)}/></label>
                </div>
                {quantity !== '' && (() => {
                  const after = afterMove(item.onHand, kind.kind, Number(quantity));
                  return after === null
                    ? <p className="cfi-preview is-bad">{moveProblem(item.onHand, kind.kind, Number(quantity)) === 'insufficient' ? t(`الكمية أكبر من المتوفر (${item.onHand}).`, `That is more than is on hand (${item.onHand}).`) : t('أدخل كمية صحيحة.', 'Enter a valid quantity.')}</p>
                    : <p className="cfi-preview">{t(`سيصبح المتوفر: ${after} (الآن ${item.onHand})`, `On hand will be ${after} (now ${item.onHand})`)}</p>;
                })()}
              </>}
              <div className="kx-btn-row">
                <button type="submit" className="kx-btn is-solid" disabled={busy}><Check size={18}/>{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}</button>
                <button type="button" className="kx-btn" onClick={() => setEditing(null)} disabled={busy}><X size={18}/>{t('إلغاء', 'Cancel')}</button>
              </div>
            </form>}
          </article>;
        })}
      </div>
    </Card>

    <Card tone="slate" icon={<History size={18}/>} title={t('سجل حركة المخزون', 'Stock history')} description={t('كل استلام وبيع وهدر وجرد، الأحدث أولاً.', 'Every delivery, sale, waste and count, newest first.')} tourId="cfa-inventory-history"
      actions={<div className="cfi-history-filters">
        <label className="kx-field"><span className="kx-sr">{t('المنتج', 'Item')}</span><select className="kx-select" value={menuFilter} onChange={e => setMenuFilter(e.target.value)}><option value="">{t('كل المنتجات', 'All items')}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="kx-field"><span className="kx-sr">{t('الفترة', 'Period')}</span><select className="kx-select" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(n => <option key={n} value={n}>{t(`آخر ${n} يوماً`, `Last ${n} days`)}</option>)}</select></label>
      </div>}>
      {history?.error && <Notice tone="red" icon={<X size={18}/>} role="alert">{history.error}</Notice>}
      {(!history || history.key !== historyKey) && <Empty icon={<RefreshCw size={24}/>}>{t('جارٍ تحميل السجل…', 'Loading the history…')}</Empty>}
      {history && history.key === historyKey && !history.error && history.movements.length === 0 && <Empty icon={<History size={24}/>}>{t('لا توجد حركات في هذه الفترة.', 'No movements in this period.')}</Empty>}
      {history && history.key === historyKey && history.movements.length > 0 && <ul className="kx-list cfi-history">
        {history.movements.map(move => <li key={move.id}>
          <span className="cfi-move-main"><Badge tone={move.delta > 0 ? 'green' : move.delta < 0 ? 'amber' : 'slate'}>{movementLabel(move.type, en)}</Badge><strong>{move.item}</strong>{move.note && <small>{move.note}</small>}</span>
          <span className="cfi-move-side"><b dir="ltr" className={move.delta < 0 ? 'is-minus' : 'is-plus'}>{move.delta > 0 ? '+' : ''}{move.delta}</b><small>{move.actor ? `${move.actor} · ` : ''}<bdi dir="ltr">{saudiTime(move.at)}</bdi></small></span>
        </li>)}
      </ul>}
    </Card>
  </div>;
}
