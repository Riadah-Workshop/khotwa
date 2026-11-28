'use client';
// "A newer version of the app is available" — inside the Android / iOS app only (a browser never shows this).
//
// The website itself always updates by itself: the app shell shows the live site, so every release reaches every phone
// the moment it is published. What a store has to deliver is the shell, so the app asks /api/app/version which version is
// current. The answer is one of:
//   available  a slim bar at the top with "Update" and "Later" (Later hides it until the app is opened again)
//   required   this version is older than the oldest the administrator allows: a full page asks for the update first
// Nothing here is a browser dialog.
import {useEffect, useState} from 'react';
import {appVersion, nativePlatform, startNativeUpdate} from './bridge';

type Answer = {status: 'current' | 'available' | 'required' | 'unknown'; latest: string; storeUrl: string; notes: {ar: string; en: string}};
const CHECK_EVERY_MS = 6 * 3_600_000;

export default function UpdateBar() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [later, setLater] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const platform = nativePlatform();
    const version = appVersion();
    if (!platform || !version) return;
    let alive = true;
    let checkedAt = 0;
    const check = async () => {
      checkedAt = Date.now();
      try {
        const response = await fetch(`/api/app/version?platform=${platform}&version=${encodeURIComponent(version)}`, {cache: 'no-store'});
        if (!response.ok || !alive) return;
        setAnswer((await response.json()) as Answer);
      } catch {
        /* offline: ask again later */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - checkedAt > CHECK_EVERY_MS) void check();
    };
    void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!answer || (answer.status !== 'available' && answer.status !== 'required')) return null;
  const update = async () => {
    setWorking(true);
    await startNativeUpdate(answer.storeUrl);
    setWorking(false);
  };
  const note = (
    <>
      {answer.notes.ar && <span lang="ar" dir="rtl">{answer.notes.ar}</span>}
      {answer.notes.en && <span lang="en" dir="ltr">{answer.notes.en}</span>}
    </>
  );

  if (answer.status === 'required') {
    return (
      <section className="app-update-wall" aria-labelledby="app-update-title">
        <div>
          <h1 id="app-update-title" role="alert">
            <span lang="ar" dir="rtl">يلزم تحديث التطبيق</span>
            <span lang="en" dir="ltr">Please update the app</span>
          </h1>
          <p lang="ar" dir="rtl">هذا الإصدار قديم ولا يعمل مع الخدمة الحالية. حدّث التطبيق إلى الإصدار {answer.latest} للمتابعة.</p>
          <p lang="en" dir="ltr">This version is too old for the current service. Update to version {answer.latest} to continue.</p>
          {note}
          <button type="button" onClick={() => void update()} disabled={working}>
            <span lang="ar" dir="rtl">تحديث الآن</span> · <span lang="en" dir="ltr">Update now</span>
          </button>
        </div>
      </section>
    );
  }
  if (later) return null;
  return (
    <div className="app-update-bar" role="status">
      <p>
        <strong lang="ar" dir="rtl">إصدار جديد من التطبيق ({answer.latest})</strong>
        <span lang="en" dir="ltr">A new version of the app is available</span>
        {note}
      </p>
      <button type="button" onClick={() => void update()} disabled={working}>
        <span lang="ar" dir="rtl">تحديث</span> · <span lang="en" dir="ltr">Update</span>
      </button>
      <button type="button" className="is-quiet" onClick={() => setLater(true)}>
        <span lang="ar" dir="rtl">لاحقاً</span> · <span lang="en" dir="ltr">Later</span>
      </button>
    </div>
  );
}
