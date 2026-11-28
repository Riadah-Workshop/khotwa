'use client';
// Quiet self-diagnosis: draws nothing. It tells the server (for the system administrator's Diagnostics tab) about
//   - script errors and promises nobody caught,
//   - requests of this site that came back as a server error (5xx),
//   - in the app, and on the cafeteria agent's page: whether the phone allows location, the camera and notifications.
// It never reads what the person typed or saw, and never sends a position. See app/native/report-client.ts.
import {useEffect} from 'react';
import {reportDevice, reportIssue} from './report-client';

/** "TypeError: x is undefined" -> a short, cleaned sentence; the server cleans again. */
const describe = (value: unknown): string => (value instanceof Error ? `${value.name}: ${value.message}` : typeof value === 'string' ? value : 'Unhandled rejection');

export default function AppHealth() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // "Script error." is a script from another site: nothing to learn from it.
      if (!event.message || event.message === 'Script error.') return;
      const where = event.filename ? `${event.filename.split('/').pop()}:${event.lineno}:${event.colno}` : '';
      reportIssue('script', event.message, where);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportIssue('promise', describe(event.reason));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // A request of this site that the server could not answer: that is the server's problem, whatever the person did.
    const original = window.fetch;
    const watched: typeof window.fetch = async (input, init) => {
      const response = await original.call(window, input, init);
      try {
        if (response.status >= 500) {
          const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(raw, window.location.href);
          if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/app/')) {
            const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
            reportIssue('api', `${method} ${url.pathname} ${response.status}`, '');
          }
        }
      } catch {
        /* reporting must never break the request */
      }
      return response;
    };
    window.fetch = watched;

    const onDevice = () => void reportDevice(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reportDevice();
    };
    document.addEventListener('visibilitychange', onVisible);
    void reportDevice();
    window.addEventListener('khotwa:device-changed', onDevice);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('khotwa:device-changed', onDevice);
      if (window.fetch === watched) window.fetch = original;
    };
  }, []);
  return null;
}
