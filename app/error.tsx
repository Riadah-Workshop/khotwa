'use client';
// What a person sees when a screen crashes, instead of a blank page. The crash is also reported (without anything the
// person typed or saw) so the system administrator can see it in Diagnostics.
import Link from 'next/link';
import {useEffect} from 'react';
import {reportIssue} from './native/report-client';

export default function ErrorPage({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {
    reportIssue('render', `${error.name || 'Error'}: ${error.message || 'render failed'}`);
  }, [error]);
  return (
    <main className="app-error" role="alert">
      <h1>
        <span lang="ar" dir="rtl">حدث خطأ غير متوقع</span>
        <br />
        <span lang="en" dir="ltr">Something went wrong</span>
      </h1>
      <p lang="ar" dir="rtl">لم تُفقد بياناتك. جرّب مرة أخرى، وإن تكرر الأمر فسيصل البلاغ إلى مدير النظام تلقائياً.</p>
      <p lang="en" dir="ltr">Nothing you saved is lost. Try again; if it keeps happening, the system administrator already has the report.</p>
      <div>
        <button type="button" onClick={() => reset()}>
          <span lang="ar" dir="rtl">إعادة المحاولة</span> · <span lang="en" dir="ltr">Try again</span>
        </button>
        <Link href="/">
          <span lang="ar" dir="rtl">الصفحة الرئيسية</span> · <span lang="en" dir="ltr">Home</span>
        </Link>
      </div>
    </main>
  );
}
