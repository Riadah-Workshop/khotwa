'use client';
// Arrival and departure of a cafeteria agent, detected by the phone by itself.
//
// There is nothing to see and nothing to press: this component draws nothing. It asks the server where the agent's
// cafeterias are, follows the phone's position, and when the agent reaches a cafeteria (or clearly leaves it) it
// reports exactly that: "arrived" or "left". The position is never sent while he is away, never kept after the
// check, and never shown to the agent or anybody else. The administrator of the cafeteria is told the times.
//
// In the Android / iOS app the position keeps arriving in the background (app/native/bridge.ts). In a browser it
// arrives only while this page is open, so there the record is best effort.
import {useEffect} from 'react';
import {decideFix, type Spot} from '../../lib/fushati/location';
import {watchPosition, type Fix} from '../native/bridge';

const RETRY_AFTER_FAILURE_MS = 60_000;
const STATUS_REFRESH_MS = 10 * 60_000;

type Status = {cafeterias: {id: string; latitude: number | null; longitude: number | null; radiusM: number}[]; insideCafeteriaId: string | null};

async function send(op: string, data: unknown): Promise<{ok: boolean; status: number}> {
  try {
    const response = await fetch('/api/fushati/presence', {method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', body: JSON.stringify({op, data})});
    return {ok: response.ok, status: response.status};
  } catch {
    return {ok: false, status: 0};
  }
}

export default function AutoArrival({language}: {language: 'ar' | 'en'}) {
  useEffect(() => {
    let alive = true;
    let stopWatching: (() => void) | null = null;
    let insideId: string | null = null;
    let outside = 0;
    let busy = false;
    let lastFailure = 0;
    let spots: Spot[] = [];
    let spotKey = '';

    const apply = (status: Status) => {
      insideId = status.insideCafeteriaId;
      spots = status.cafeterias.flatMap((c) => (c.latitude === null || c.longitude === null ? [] : [{id: c.id, lat: c.latitude, lng: c.longitude, radiusM: c.radiusM}]));
      spotKey = spots.map((s) => `${s.id}:${s.lat}:${s.lng}:${s.radiusM}`).join('|');
    };

    const load = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/fushati/presence?op=status', {cache: 'no-store'});
        if (!response.ok) return false;
        apply((await response.json()) as Status);
        return true;
      } catch {
        return false;
      }
    };

    const onFix = async (fix: Fix) => {
      if (!alive || busy) return;
      const decision = decideFix(insideId, outside, fix, spots);
      outside = decision.outsideCount;
      const {action} = decision;
      if (action.type !== 'check-in' && action.type !== 'check-out') return;
      const stamp = Date.now();
      if (stamp - lastFailure < RETRY_AFTER_FAILURE_MS) return;
      busy = true;
      const reply = action.type === 'check-in' ? await send('check-in', {cafeteriaId: action.cafeteriaId, ...fix}) : await send('check-out', fix);
      busy = false;
      if (reply.ok) {
        insideId = action.type === 'check-in' ? action.cafeteriaId : null;
        outside = 0;
      } else {
        lastFailure = stamp;
        if (reply.status === 403 || reply.status === 409) void load();
      }
    };

    const start = async () => {
      if (!(await load()) || !alive) return;
      if (!spots.length) return;
      stopWatching = await watchPosition((fix) => void onFix(fix), {
        backgroundTitle: language === 'en' ? 'Fushati' : 'فسحتي',
        backgroundMessage: language === 'en' ? 'Arrival and departure at the cafeteria are recorded for attendance.' : 'يُسجَّل وقت الوصول إلى المقصف والمغادرة لأغراض الحضور.',
      });
    };

    const first = setTimeout(() => void start(), 0);
    // The cafeteria's point can be set or moved while the app stays open: look again now and then, and restart the watch if it changed.
    const timer = setInterval(async () => {
      const before = spotKey;
      if (!(await load()) || !alive) return;
      if (before !== spotKey) {
        stopWatching?.();
        stopWatching = null;
        if (spots.length) stopWatching = await watchPosition((fix) => void onFix(fix), {backgroundTitle: language === 'en' ? 'Fushati' : 'فسحتي', backgroundMessage: language === 'en' ? 'Arrival and departure at the cafeteria are recorded for attendance.' : 'يُسجَّل وقت الوصول إلى المقصف والمغادرة لأغراض الحضور.'});
      }
    }, STATUS_REFRESH_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
      stopWatching?.();
    };
  }, [language]);
  return null;
}
