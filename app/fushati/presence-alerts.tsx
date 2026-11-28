'use client';
// The alert bar for the administrator: "Sara arrived at Main cafeteria 07:12", "Sara left Main cafeteria 14:05".
// It sits at the top of the page, on every tab, and is not a popup: it takes its own row and never covers anything.
// It asks the server for what is new every 30 seconds while the page is in front, and as soon as the page comes back.
// It starts from "now": it never replays history. E-mail alerts (a switch on the Attendance tab) cover the time the page is closed.
import {useEffect, useState} from 'react';
import {Bell, X} from 'lucide-react';
import './presence.css';

type FeedEvent = {id: string; kind: 'arrived' | 'left'; at: string; cafeteria: string; name: string};
const MAX_SHOWN = 4;
const EVERY_MS = 30_000;

export default function PresenceAlerts({language, onOpen}: {language: 'ar' | 'en'; onOpen?: () => void}) {
  const [items, setItems] = useState<FeedEvent[]>([]);
  useEffect(() => {
    let alive = true;
    let cursor: string | null = null;
    const seen = new Set<string>();
    const poll = async () => {
      try {
        const response = await fetch(`/api/fushati/presence?op=feed${cursor ? `&since=${encodeURIComponent(cursor)}` : ''}`, {cache: 'no-store'});
        if (!response.ok || !alive) return;
        const body = (await response.json()) as {now: string; events: FeedEvent[]};
        cursor = body.now;
        const fresh = body.events.filter((event) => !seen.has(event.id));
        for (const event of fresh) seen.add(event.id);
        if (fresh.length) setItems((old) => [...old, ...fresh].slice(-MAX_SHOWN));
      } catch {
        // offline: try again at the next turn
      }
    };
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!items.length) return null;
  const en = language === 'en';
  const locale = en ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn';
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, {timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit'});
  return (
    <div className="fs-alerts" role="status" aria-live="polite" data-tour="cfa-alerts">
      <Bell size={18} aria-hidden="true" />
      <ul>
        {items.map((event) => (
          <li key={event.id} data-kind={event.kind}>
            <strong>{event.name}</strong> {event.kind === 'arrived' ? (en ? 'arrived at' : 'وصل إلى') : en ? 'left' : 'غادر'} {event.cafeteria} <span dir="ltr">{time(event.at)}</span>
          </li>
        ))}
      </ul>
      {onOpen && <button type="button" className="fs-alerts-open" onClick={onOpen}>{en ? 'Attendance' : 'الحضور'}</button>}
      <button type="button" className="fs-alerts-close" aria-label={en ? 'Dismiss' : 'إخفاء'} onClick={() => setItems([])}><X size={16} aria-hidden="true" /></button>
    </div>
  );
}
