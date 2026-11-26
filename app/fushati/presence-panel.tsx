'use client';
// "Map and attendance" for cafeteria administrators and supervisors who may see it (presence_view):
// their cafeterias on a map, the agents who are inside them right now (name, phone, last report), and the
// log of when each agent came and left. The system administrator also sets each cafeteria's map point here.
import {useCallback, useEffect, useState} from 'react';
import './presence.css';
import OsmMap, {type MapMarker} from '../../components/osm-map';
import {isLatitude, isLongitude, MAX_ARRIVAL_RADIUS_M, MIN_ARRIVAL_RADIUS_M, roundCoordinate} from '../../lib/fushati/location';

type MapCafeteria = {id: string; name: string; alias: string; schoolName: string; active: boolean; latitude: number | null; longitude: number | null; radiusM: number; canManage: boolean};
type MapVisit = {
  id: string; cafeteriaId: string; userId: string; name: string; phone: string; arrivedAt: string; leftAt: string | null; leaveReason: string | null;
  state: 'live' | 'stale' | 'lost' | 'ended'; durationMin: number; arriveDistanceM: number; lastSeenAt: string; position: {lat: number; lng: number; accuracyM: number} | null;
};
type MapData = {now: string; canSetLocation: boolean; cafeterias: MapCafeteria[]; visits: MapVisit[]};
type Editing = {id: string; lat: string; lng: string; radius: string};

const cafeLabel = (c: {name: string; alias: string}) => (c.alias ? `${c.alias} (${c.name})` : c.name);

async function post(op: string, data: unknown): Promise<{ok: boolean; error?: string}> {
  const response = await fetch('/api/fushati/presence', {method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', body: JSON.stringify({op, data})});
  const body = (await response.json().catch(() => ({}))) as {error?: string};
  return {ok: response.ok, error: body.error};
}

export default function PresencePanel({language}: {language: 'ar' | 'en'}) {
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  // Refresh every 20 seconds while the page is in front; the first load is queued so it is never a synchronous state change.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const response = await fetch(`/api/fushati/presence?op=map&days=${days}`, {cache: 'no-store'});
        const body = await response.json();
        if (!alive) return;
        if (!response.ok) throw new Error(body.error || 'error');
        setData(body as MapData);
        setError('');
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : 'error');
      }
    };
    const first = setTimeout(run, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 20000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [days, reload]);

  const locale = language === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn';
  const time = useCallback((iso: string) => new Date(iso).toLocaleTimeString(locale, {timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit'}), [locale]);
  const day = useCallback((iso: string) => new Date(iso).toLocaleDateString(locale, {timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short'}), [locale]);

  if (!data) return <section className="fs-card" aria-live="polite"><h2>{t('الخريطة والحضور', 'Map & attendance')}</h2><p className={error ? 'fs-error' : undefined}>{error || t('جار التحميل…', 'Loading…')}</p></section>;

  const nowMs = Date.parse(data.now);
  const minutesAgo = (iso: string) => Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));
  const cafes = data.cafeterias.filter((c) => filter === 'all' || c.id === filter);
  const cafeById = new Map<string, MapCafeteria>(data.cafeterias.map((c): [string, MapCafeteria] => [c.id, c]));
  const visits = data.visits.filter((v) => filter === 'all' || v.cafeteriaId === filter);
  const present = visits.filter((v) => v.state === 'live' || v.state === 'stale');
  const reasonLabel = (v: MapVisit) => {
    if (!v.leftAt) return t('موجود الآن', 'Present');
    switch (v.leaveReason) {
      case 'left_area': return t('غادر المنطقة', 'Left the area');
      case 'moved': return t('انتقل إلى مقصف آخر', 'Moved to another cafeteria');
      case 'signal_lost': return t('انقطعت الإشارة', 'Signal lost');
      case 'closed_by_admin': return t('أنهاها المدير', 'Ended by administrator');
      default: return t('سجّل المغادرة', 'Checked out');
    }
  };
  const duration = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}${t(' س ', 'h ')}${minutes % 60}${t(' د', 'm')}` : `${minutes}${t(' د', 'm')}`);

  const markers: MapMarker[] = [];
  for (const c of cafes) {
    if (c.latitude === null || c.longitude === null) continue;
    markers.push({id: c.id, lat: c.latitude, lng: c.longitude, kind: 'cafeteria', label: `${cafeLabel(c)} — ${c.schoolName}`, radiusM: c.radiusM});
  }
  for (const v of present) {
    if (!v.position) continue;
    markers.push({id: v.id, lat: v.position.lat, lng: v.position.lng, kind: v.state === 'live' ? 'agent' : 'agent-stale', label: `${v.name}${v.phone ? ` · ${v.phone}` : ''}`});
  }

  const draft = editing && isLatitude(Number(editing.lat)) && isLongitude(Number(editing.lng)) && editing.lat.trim() !== '' && editing.lng.trim() !== '' ? {lat: Number(editing.lat), lng: Number(editing.lng)} : null;
  const selectedVisit = visits.find((v) => v.id === selected) || null;
  const selectedCafe = cafeById.get(selected || '') || null;
  const unlocated = cafes.filter((c) => c.latitude === null || c.longitude === null);

  async function saveLocation(clear: boolean) {
    if (!editing) return;
    setBusy(true);
    setError('');
    const radius = Number(editing.radius);
    const body = clear
      ? {id: editing.id, latitude: null, longitude: null}
      : {id: editing.id, latitude: roundCoordinate(Number(editing.lat)), longitude: roundCoordinate(Number(editing.lng)), radiusM: radius};
    if (!clear && (!draft || !Number.isInteger(radius) || radius < MIN_ARRIVAL_RADIUS_M || radius > MAX_ARRIVAL_RADIUS_M)) {
      setBusy(false);
      setError(t(`أدخل إحداثيات صحيحة ونصف قطر بين ${MIN_ARRIVAL_RADIUS_M} و${MAX_ARRIVAL_RADIUS_M} متراً`, `Enter valid coordinates and a radius between ${MIN_ARRIVAL_RADIUS_M} and ${MAX_ARRIVAL_RADIUS_M} metres`));
      return;
    }
    const result = await post('set-location', body);
    setBusy(false);
    if (!result.ok) return setError(result.error || 'error');
    setEditing(null);
    setReload((n) => n + 1);
  }

  async function endStay(visitId: string) {
    setBusy(true);
    const result = await post('force-checkout', {visitId});
    setBusy(false);
    if (!result.ok) return setError(result.error || 'error');
    setReload((n) => n + 1);
  }

  function fillFromDevice() {
    if (!editing || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setEditing((current) => (current ? {...current, lat: String(roundCoordinate(p.coords.latitude)), lng: String(roundCoordinate(p.coords.longitude))} : current)),
      () => setError(t('تعذر تحديد موقعك. اسمح للمتصفح بالوصول إلى الموقع أو اضغط على الخريطة.', 'Could not get your location. Allow location access or click the map.')),
      {enableHighAccuracy: true, timeout: 15000},
    );
  }

  return (
    <section className="fs-card fs-presence">
      <div className="fs-presence-head">
        <h2>{t('الخريطة والحضور', 'Map & attendance')}</h2>
        <label>{t('المقصف', 'Cafeteria')}{' '}
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setSelected(null); }}>
            <option value="all">{t('كل مقاصفي', 'All my cafeterias')}</option>
            {data.cafeterias.map((c) => <option key={c.id} value={c.id}>{cafeLabel(c)}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="fs-error">{error}</p>}
      {!data.cafeterias.length && <p>{t('لا توجد مقاصف متاحة لك.', 'No cafeterias are available to you.')}</p>}

      <div className="fs-presence-grid">
        <div>
          <OsmMap
            markers={markers}
            selectedId={selected}
            onSelect={setSelected}
            picked={editing ? draft : null}
            onPick={editing ? (point) => setEditing({...editing, lat: String(roundCoordinate(point.lat)), lng: String(roundCoordinate(point.lng))}) : undefined}
            height={430}
            fitKey={`${filter}|${editing?.id || ''}`}
            labels={{map: t('خريطة المقاصف والموظفين', 'Map of cafeterias and staff'), zoomIn: t('تكبير', 'Zoom in'), zoomOut: t('تصغير', 'Zoom out'), fit: t('عرض الكل', 'Show everything'), attribution: '© OpenStreetMap'}}
          />
          <p className="fs-legend">
            <span className="fs-dot fs-dot-cafe" /> {t('مقصف', 'Cafeteria')}
            <span className="fs-dot fs-dot-live" /> {t('موظف (مباشر)', 'Agent (live)')}
            <span className="fs-dot fs-dot-stale" /> {t('موظف (لا إشارة حديثة)', 'Agent (no recent signal)')}
          </p>
          {(selectedVisit || selectedCafe) && (
            <div className="fs-selected" role="status">
              {selectedVisit && <>
                <strong>{selectedVisit.name}</strong>
                {selectedVisit.phone && <> · <a dir="ltr" href={`tel:${selectedVisit.phone}`}>{selectedVisit.phone}</a></>}
                <br />{cafeLabel(cafeById.get(selectedVisit.cafeteriaId) || {name: '', alias: ''})} · {t('وصل', 'Arrived')} {time(selectedVisit.arrivedAt)} · {t('آخر إشارة منذ', 'Last signal')} {minutesAgo(selectedVisit.lastSeenAt)} {t('د', 'min ago')}
                {selectedVisit.position && <> · {t('دقة الموقع', 'Accuracy')} ±{selectedVisit.position.accuracyM} {t('م', 'm')}</>}
              </>}
              {selectedCafe && <>
                <strong>{cafeLabel(selectedCafe)}</strong> · {selectedCafe.schoolName}
                <br />{t('نصف قطر الوصول', 'Arrival radius')}: {selectedCafe.radiusM} {t('م', 'm')} · {t('الموظفون الآن', 'Agents now')}: {present.filter((v) => v.cafeteriaId === selectedCafe.id).length}
              </>}
            </div>
          )}
        </div>

        <div>
          <h3>{t('الموجودون الآن', 'Here now')} ({present.length})</h3>
          {!present.length && <p className="fs-muted">{t('لا يوجد موظف مسجل الحضور حالياً.', 'No agent is checked in right now.')}</p>}
          <ul className="fs-agents">
            {present.map((v) => {
              const cafe = cafeById.get(v.cafeteriaId);
              return (
                <li key={v.id} data-selected={v.id === selected ? 'true' : undefined}>
                  <button type="button" className="fs-agent-main" onClick={() => setSelected(v.id === selected ? null : v.id)}>
                    <span className={`fs-dot ${v.state === 'live' ? 'fs-dot-live' : 'fs-dot-stale'}`} />
                    <strong>{v.name}</strong>
                    <small>{cafe ? cafeLabel(cafe) : ''} · {t('منذ', 'since')} {time(v.arrivedAt)} · {v.state === 'live' ? t('مباشر', 'live') : `${t('لا إشارة منذ', 'no signal for')} ${minutesAgo(v.lastSeenAt)} ${t('د', 'min')}`}</small>
                  </button>
                  <span className="fs-agent-actions">
                    {v.phone && <a className="fs-call" dir="ltr" href={`tel:${v.phone}`}>{v.phone}</a>}
                    {cafe?.canManage && <button type="button" disabled={busy} onClick={() => endStay(v.id)}>{t('إنهاء الحضور', 'End stay')}</button>}
                  </span>
                </li>
              );
            })}
          </ul>

          {unlocated.length > 0 && <>
            <h3>{t('مقاصف بلا موقع على الخريطة', 'Cafeterias with no map location')}</h3>
            <ul className="fs-agents">
              {unlocated.map((c) => (
                <li key={c.id}>
                  <span className="fs-agent-main"><strong>{cafeLabel(c)}</strong><small>{data.canSetLocation ? t('حدد موقعها ليتمكن الموظفون من تسجيل الحضور', 'Set its location so agents can check in') : t('اطلب من مدير نظام خطوة تحديد الموقع', 'Ask the system administrator to set the location')}</small></span>
                  {data.canSetLocation && <button type="button" onClick={() => setEditing({id: c.id, lat: '', lng: '', radius: String(c.radiusM)})}>{t('تحديد الموقع', 'Set location')}</button>}
                </li>
              ))}
            </ul>
          </>}
        </div>
      </div>

      {data.canSetLocation && cafes.some((c) => c.latitude !== null) && !editing && (
        <p className="fs-muted">{t('لتعديل موقع مقصف:', 'To change a cafeteria’s location:')} {cafes.filter((c) => c.latitude !== null).map((c) => (
          <button type="button" key={c.id} className="fs-link" onClick={() => setEditing({id: c.id, lat: String(c.latitude), lng: String(c.longitude), radius: String(c.radiusM)})}>{cafeLabel(c)}</button>
        ))}</p>
      )}

      {editing && (
        <form className="fs-locate" onSubmit={(e) => { e.preventDefault(); void saveLocation(false); }}>
          <h3>{t('موقع', 'Location of')} {cafeLabel(cafeById.get(editing.id) || {name: '', alias: ''})}</h3>
          <p>{t('اضغط على الخريطة عند باب المقصف أو بوابة المدرسة، أو أدخل الإحداثيات.', 'Click the map at the cafeteria door or the school gate, or type the coordinates.')}</p>
          <div className="fs-fields">
            <label>{t('خط العرض', 'Latitude')}<input dir="ltr" inputMode="decimal" value={editing.lat} onChange={(e) => setEditing({...editing, lat: e.target.value})} /></label>
            <label>{t('خط الطول', 'Longitude')}<input dir="ltr" inputMode="decimal" value={editing.lng} onChange={(e) => setEditing({...editing, lng: e.target.value})} /></label>
            <label>{t('نصف قطر الوصول (م)', 'Arrival radius (m)')}<input dir="ltr" inputMode="numeric" value={editing.radius} onChange={(e) => setEditing({...editing, radius: e.target.value})} /></label>
          </div>
          <div className="fs-locate-actions">
            <button type="button" onClick={fillFromDevice}>{t('استخدم موقعي الحالي', 'Use my current location')}</button>
            <button type="submit" disabled={busy}>{t('حفظ الموقع', 'Save location')}</button>
            <button type="button" disabled={busy} onClick={() => void saveLocation(true)}>{t('إزالة الموقع', 'Clear location')}</button>
            <button type="button" onClick={() => setEditing(null)}>{t('إلغاء', 'Cancel')}</button>
          </div>
        </form>
      )}

      <div className="fs-log-head">
        <h3>{t('سجل الحضور والانصراف', 'Arrival and departure log')}</h3>
        <label>{t('الفترة', 'Period')}{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>{t('اليوم', 'Today')}</option>
            <option value={7}>{t('٧ أيام', '7 days')}</option>
            <option value={30}>{t('٣٠ يوماً', '30 days')}</option>
          </select>
        </label>
      </div>
      <div className="fs-table">
        <table>
          <thead><tr><th>{t('التاريخ', 'Date')}</th><th>{t('الموظف', 'Agent')}</th><th>{t('المقصف', 'Cafeteria')}</th><th>{t('الوصول', 'Arrived')}</th><th>{t('المغادرة', 'Left')}</th><th>{t('المدة', 'Duration')}</th><th>{t('الحالة', 'Status')}</th></tr></thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>{day(v.arrivedAt)}</td>
                <td>{v.name}{v.phone && <> <a dir="ltr" href={`tel:${v.phone}`}>{v.phone}</a></>}</td>
                <td>{cafeLabel(cafeById.get(v.cafeteriaId) || {name: '', alias: ''})}</td>
                <td>{time(v.arrivedAt)}</td>
                <td>{v.leftAt ? time(v.leftAt) : '—'}</td>
                <td>{duration(v.durationMin)}</td>
                <td>{reasonLabel(v)}</td>
              </tr>
            ))}
            {!visits.length && <tr><td colSpan={7}>{t('لا توجد سجلات في هذه الفترة.', 'No records in this period.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="fs-muted">{t('يُسجَّل موقع الموظف فقط بين وصوله ومغادرته، ولا يظهر إلا لمن لديه صلاحية رؤية الحضور.', 'An agent’s position is recorded only between arrival and departure, and shown only to people allowed to see attendance.')}</p>
    </section>
  );
}
