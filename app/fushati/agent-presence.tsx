'use client';
// The agent's arrival card. While "arrival detection" is on, the phone watches its own position and:
//   - reaches the cafeteria  -> records the arrival; the agent shows as available on the administrator's map
//   - stays                  -> reports its position every half minute
//   - clearly leaves         -> records the departure
// Before arrival the position never leaves the phone. After arrival it is shared with the people allowed to see
// attendance until the agent leaves or checks out. A web page cannot track in the background, so the page has to stay open.
import {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, MapPin} from 'lucide-react';
import './presence.css';
import {decideFix, nearestSpot, type Fix, type Spot} from '../../lib/fushati/location';

type StatusCafeteria = {id: string; name: string; alias: string; latitude: number | null; longitude: number | null; radiusM: number};
type StatusVisit = {id: string; cafeteriaId: string; arrivedAt: string; lastSeenAt: string};
type Recent = {id: string; cafeteriaId: string; arrivedAt: string; leftAt: string | null; leaveReason: string | null};
type Status = {now: string; cafeterias: StatusCafeteria[]; visit: StatusVisit | null; recent: Recent[]};
type Message = {tone: 'ok' | 'warn' | 'error'; text: string};
type Reply = {ok: boolean; status: number; body: {error?: string; code?: string; distanceM?: number; radiusM?: number; arrivedAt?: string; leftAt?: string; reason?: string; visitId?: string}};

const STORAGE_KEY = 'khotwa:fushati-arrival';
const PING_EVERY_MS = 30_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const label = (c: {name: string; alias: string}) => (c.alias ? `${c.alias} (${c.name})` : c.name);

async function send(op: string, data: unknown): Promise<Reply> {
  try {
    const response = await fetch('/api/fushati/presence', {method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', body: JSON.stringify({op, data})});
    return {ok: response.ok, status: response.status, body: (await response.json().catch(() => ({}))) as Reply['body']};
  } catch {
    return {ok: false, status: 0, body: {code: 'network'}};
  }
}

const readFix = (position: GeolocationPosition): Fix => ({lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy});

function currentPosition(timeout: number): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(readFix(p)), () => resolve(null), {enableHighAccuracy: true, timeout, maximumAge: 5000});
  });
}

export default function AgentPresence({language}: {language: 'ar' | 'en'}) {
  const t = useCallback((ar: string, en: string) => (language === 'en' ? en : ar), [language]);
  const [status, setStatus] = useState<Status | null>(null);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [nearest, setNearest] = useState<{name: string; distanceM: number} | null>(null);
  const [supported, setSupported] = useState(true);

  // What the position handler needs between renders. Written only from effects and callbacks, never while rendering.
  const visitRef = useRef<string | null>(null);
  const outsideRef = useRef(0);
  const spotsRef = useRef<Spot[]>([]);
  const namesRef = useRef(new Map<string, string>());
  const busyRef = useRef(false);
  const lastPingRef = useRef(0);
  const lastFailureRef = useRef(0);

  const locale = language === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn';
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, {timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit'});

  const applyStatus = useCallback((next: Status) => {
    visitRef.current = next.visit?.cafeteriaId ?? null;
    spotsRef.current = next.cafeterias.flatMap((c) => (c.latitude === null || c.longitude === null ? [] : [{id: c.id, lat: c.latitude, lng: c.longitude, radiusM: c.radiusM}]));
    namesRef.current = new Map(next.cafeterias.map((c) => [c.id, label(c)]));
    setStatus(next);
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/fushati/presence?op=status', {cache: 'no-store'});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'error');
      applyStatus(body as Status);
    } catch (failure) {
      setMessage({tone: 'error', text: failure instanceof Error ? failure.message : 'error'});
    }
  }, [applyStatus]);

  const explain = useCallback((reply: Reply): Message => {
    const {code, distanceM, radiusM, error} = reply.body;
    if (code === 'too_far') return {tone: 'warn', text: t(`أنت على بعد ${distanceM ?? '؟'} م من المقصف. يُسجَّل الحضور عند الاقتراب لمسافة ${radiusM ?? '؟'} م.`, `You are ${distanceM ?? '?'} m from the cafeteria. Arrival is recorded within ${radiusM ?? '?'} m.`)};
    if (code === 'no_location') return {tone: 'warn', text: t('لم يحدد مدير النظام موقع هذا المقصف بعد؛ أبلغ مدير المقصف.', 'The location of this cafeteria has not been set yet. Tell your administrator.')};
    if (code === 'network') return {tone: 'error', text: t('لا يوجد اتصال بالإنترنت. سنحاول مجدداً.', 'No connection. Trying again shortly.')};
    return {tone: 'error', text: error || t('تعذر تسجيل الحضور', 'Could not record attendance')};
  }, [t]);

  // First load; queued so it is never a synchronous state change inside the effect.
  useEffect(() => {
    const first = setTimeout(() => {
      if (!('geolocation' in navigator)) setSupported(false);
      void reload();
    }, 0);
    return () => clearTimeout(first);
  }, [reload]);

  // Resume on the next visit, but only where the browser already has permission: no surprise permission prompt on page load.
  useEffect(() => {
    let alive = true;
    const first = setTimeout(async () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== 'on' || !navigator.permissions) return;
        const permission = await navigator.permissions.query({name: 'geolocation'});
        if (alive && permission.state === 'granted') setWatching(true);
      } catch {
        // No stored preference or no Permissions API: the agent turns it on himself.
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(first);
    };
  }, []);

  // The watch itself.
  const hasSpots = (status?.cafeterias.some((c) => c.latitude !== null && c.longitude !== null)) ?? false;
  useEffect(() => {
    if (!watching || !hasSpots || !('geolocation' in navigator)) return;
    const onFix = async (position: GeolocationPosition) => {
      const fix = readFix(position);
      const near = nearestSpot(fix, spotsRef.current);
      setNearest(near ? {name: namesRef.current.get(near.spot.id) ?? '', distanceM: Math.round(near.distanceM)} : null);
      const decision = decideFix(visitRef.current, outsideRef.current, fix, spotsRef.current);
      outsideRef.current = decision.outsideCount;
      if (busyRef.current) return;
      const stamp = Date.now();
      const {action} = decision;
      if (action.type === 'check-in') {
        if (stamp - lastFailureRef.current < RETRY_AFTER_FAILURE_MS) return;
        busyRef.current = true;
        const reply = await send('check-in', {cafeteriaId: action.cafeteriaId, ...fix});
        busyRef.current = false;
        if (reply.ok) {
          lastPingRef.current = stamp;
          void reload();
          setMessage({tone: 'ok', text: t('تم تسجيل وصولك. أنت الآن متاح على الخريطة.', 'Arrival recorded. You now show as available on the map.')});
        } else {
          lastFailureRef.current = stamp;
          setMessage(explain(reply));
        }
      } else if (action.type === 'ping') {
        if (!visitRef.current || stamp - lastPingRef.current < PING_EVERY_MS) return;
        lastPingRef.current = stamp;
        const reply = await send('ping', fix);
        if (reply.status === 409 && reply.body.code === 'not_checked_in') {
          // The server ended the stay (an administrator, or the phone was silent too long).
          void reload();
          setMessage({tone: 'warn', text: t('انتهى تسجيل حضورك. سيُسجَّل وصولك من جديد تلقائياً عند وجودك في المقصف.', 'Your stay was ended. Arrival will be recorded again automatically while you are at the cafeteria.')});
        }
      } else if (action.type === 'check-out') {
        busyRef.current = true;
        const reply = await send('check-out', fix);
        busyRef.current = false;
        if (reply.ok) {
          void reload();
          setMessage({tone: 'ok', text: t('تم تسجيل مغادرتك المقصف.', 'Departure recorded: you have left the cafeteria.')});
        } else setMessage(explain(reply));
      }
    };
    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        setWatching(false);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        setMessage({tone: 'error', text: t('تم رفض إذن الموقع. فعّله من إعدادات المتصفح ثم أعد المحاولة.', 'Location permission was denied. Allow it in the browser settings and try again.')});
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        setMessage({tone: 'warn', text: t('تعذر تحديد موقعك الآن. تأكد من تفعيل خدمة الموقع في الجهاز.', 'Your position is not available right now. Check that location services are on.')});
      }
    };
    const id = navigator.geolocation.watchPosition((p) => void onFix(p), onError, {enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000});
    return () => navigator.geolocation.clearWatch(id);
  }, [watching, hasSpots, reload, explain, t]);

  function turnOn() {
    try { localStorage.setItem(STORAGE_KEY, 'on'); } catch { /* storage unavailable */ }
    setMessage(null);
    setWatching(true);
  }

  async function turnOff() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    setWatching(false);
    setNearest(null);
    // Stopping the sharing ends the stay: otherwise the map would show a position that no longer updates.
    if (visitRef.current) await checkOut();
  }

  async function checkInNow() {
    if (!status) return;
    setBusy(true);
    setMessage(null);
    const fix = await currentPosition(15_000);
    if (!fix) {
      setBusy(false);
      return setMessage({tone: 'error', text: t('تعذر تحديد موقعك. اسمح للمتصفح بالوصول إلى الموقع.', 'Could not get your position. Allow the browser to use your location.')});
    }
    const near = nearestSpot(fix, spotsRef.current);
    if (!near) {
      setBusy(false);
      return setMessage({tone: 'warn', text: t('لا يوجد مقصف محدد الموقع لتسجيل الحضور فيه.', 'None of your cafeterias has a map location yet.')});
    }
    const reply = await send('check-in', {cafeteriaId: near.spot.id, ...fix});
    setBusy(false);
    if (!reply.ok) return setMessage(explain(reply));
    lastPingRef.current = Date.now();
    await reload();
    setMessage({tone: 'ok', text: t('تم تسجيل وصولك.', 'Arrival recorded.')});
    if (!watching) turnOn();
  }

  async function checkOut() {
    setBusy(true);
    setMessage(null);
    const fix = await currentPosition(5_000);
    const reply = await send('check-out', fix ?? {});
    setBusy(false);
    outsideRef.current = 0;
    if (!reply.ok) return setMessage(explain(reply));
    await reload();
    setMessage({tone: 'ok', text: t('تم تسجيل مغادرتك.', 'Departure recorded.')});
  }

  const nameOf = (id: string) => {
    const cafeteria = status?.cafeterias.find((c) => c.id === id);
    return cafeteria ? label(cafeteria) : '';
  };
  const here = status?.visit ? nameOf(status.visit.cafeteriaId) : '';
  const reasonText = (reason: string | null) => {
    switch (reason) {
      case 'left_area': return t('غادر المنطقة', 'left the area');
      case 'moved': return t('انتقل إلى مقصف آخر', 'moved to another cafeteria');
      case 'signal_lost': return t('انقطعت الإشارة', 'signal lost');
      case 'closed_by_admin': return t('أنهاها المدير', 'ended by administrator');
      default: return t('سجّل المغادرة', 'checked out');
    }
  };

  return (
    <section className="fs-card fs-here" aria-live="polite">
      <h2><MapPin size={20} /> {t('الوصول والتواجد في المقصف', 'Arrival and availability')}</h2>
      {!status && <p className="fs-muted">{t('جار التحميل…', 'Loading…')}</p>}
      {status && !status.cafeterias.length && <p className="fs-muted">{t('لا توجد مقاصف معيّنة لك.', 'No cafeteria is assigned to you.')}</p>}
      {status && status.cafeterias.length > 0 && !hasSpots && <p className="fs-muted">{t('لم يُحدَّد موقع مقصفك على الخريطة بعد. أبلغ مدير النظام ليتمكن النظام من تسجيل وصولك.', 'Your cafeteria has no map location yet. Ask the system administrator to set it so your arrival can be recorded.')}</p>}
      {status && status.visit && (
        <p className="fs-here-status"><span className="fs-dot fs-dot-live" /> <strong>{t('متاح في', 'Available at')} {here}</strong> · {t('منذ', 'since')} {time(status.visit.arrivedAt)}</p>
      )}
      {status && !status.visit && hasSpots && (
        <p className="fs-here-status"><span className="fs-dot fs-dot-stale" /> {t('غير مسجل الحضور', 'Not checked in')}{nearest && <> · {t('أقرب مقصف', 'nearest')}: {nearest.name} — {nearest.distanceM} {t('م', 'm')}</>}</p>
      )}
      {!supported && <p className="fs-error">{t('هذا المتصفح لا يدعم تحديد الموقع.', 'This browser cannot share its location.')}</p>}
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'fs-error' : message.tone === 'ok' ? 'fs-notice' : 'fs-muted'}>{message.text}</p>}

      {status && hasSpots && supported && (
        <div className="fs-here-actions">
          {!watching && <button type="button" onClick={turnOn}>{t('تفعيل رصد الوصول والمغادرة', 'Turn on arrival detection')}</button>}
          {watching && <button type="button" onClick={() => void turnOff()} disabled={busy}>{t('إيقاف المشاركة', 'Stop sharing')}</button>}
          {!status.visit && <button type="button" onClick={() => void checkInNow()} disabled={busy}>{busy && <Loader2 size={16} className="fs-spin" />} {t('تسجيل وصولي الآن', 'Check in now')}</button>}
          {status.visit && <button type="button" onClick={() => void checkOut()} disabled={busy}>{busy && <Loader2 size={16} className="fs-spin" />} {t('تسجيل مغادرتي', 'Check out')}</button>}
        </div>
      )}
      {status && status.visit && !watching && hasSpots && <p className="fs-muted">{t('أنت مسجل الحضور لكن مشاركة الموقع متوقفة على هذا الجهاز، فلا يتحدث موقعك. فعّل الرصد أو سجّل مغادرتك.', 'You are checked in, but sharing is off on this device, so your position is not updating. Turn detection on or check out.')}</p>}
      {watching && <p className="fs-muted">{t('أبقِ هذه الصفحة مفتوحة: لا يمكن للمتصفح تتبع موقعك وهي مغلقة.', 'Keep this page open: a browser cannot follow your position while it is closed.')}</p>}
      <p className="fs-muted">{t('خصوصيتك: لا يغادر موقعك جهازك قبل وصولك. بعد الوصول يراه مدير المقصف ومن منحه صلاحية الحضور فقط، حتى تغادر أو تسجّل مغادرتك.', 'Your privacy: your position does not leave this phone before you arrive. After arrival, only your cafeteria administrator and people they allow can see it, until you leave or check out.')}</p>

      {status && status.recent.length > 0 && (
        <details>
          <summary>{t('آخر سجلاتي', 'My recent records')}</summary>
          <ul>
            {status.recent.slice(0, 5).map((r) => (
              <li key={r.id}>{new Date(r.arrivedAt).toLocaleDateString(locale, {timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short'})} · {nameOf(r.cafeteriaId)} · {time(r.arrivedAt)} → {r.leftAt ? `${time(r.leftAt)} (${reasonText(r.leaveReason)})` : t('حتى الآن', 'now')}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
