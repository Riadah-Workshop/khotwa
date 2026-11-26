// The first-login tours, one per platform. Plain data so every step is translated
// and every highlighted element is checked by scripts/test-guided-tour.mjs.
//
// target: a CSS selector of the form [data-tour="name"]; the element must exist
// in one of the files listed for that platform in TOUR_SOURCES. A step without
// a target is shown in the middle of the screen (welcome and closing steps).
// section: which tab of the screen to open before showing the step, so a
// highlighted element that lives in another tab is on screen when it is explained.

export type TourText = {ar: string; en: string};
export type TourTone = 'green' | 'teal' | 'blue' | 'violet' | 'amber' | 'red' | 'slate';
export type TourIconName = 'welcome' | 'children' | 'attendance' | 'cases' | 'wallet' | 'card' | 'transfer' | 'history' | 'language' | 'password' | 'help' | 'inventory' | 'reports' | 'map' | 'settings' | 'students' | 'messages' | 'visitors' | 'shield' | 'scan' | 'cafeteria' | 'dashboard' | 'backup';
export type TourStep = {id: string; target?: string; section?: string; icon: TourIconName; tone?: TourTone; title: TourText; body: TourText};
export type TourPlatform = 'parent' | 'admin' | 'agent' | 'manager' | 'cafeteria-agent' | 'cafeteria-admin';

export const TOUR_PLATFORMS: TourPlatform[] = ['parent', 'admin', 'agent', 'manager', 'cafeteria-agent', 'cafeteria-admin'];

export const TOURS: Partial<Record<TourPlatform, TourStep[]>> = {
  parent: [
    {id: 'welcome', icon: 'welcome', tone: 'green',
      title: {ar: 'أهلاً بك في بوابة ولي الأمر', en: 'Welcome to the Parent Portal'},
      body: {ar: 'من هنا تتابع حضور أبنائك وتأخرهم والحالات المسجلة، وتدير مصروفهم في المقصف. السجلات المدرسية للعرض فقط. هذه جولة قصيرة تعرّفك على الأقسام، ويمكنك تخطيها في أي وقت.', en: "Follow your children's attendance, lateness and recorded cases, and manage their cafeteria spending. School records are read-only. This short tour shows you around, and you can skip it at any time."}},
    {id: 'children', target: '[data-tour="children"]', section: 'overview', icon: 'children', tone: 'teal',
      title: {ar: 'اختر الابن', en: 'Choose a child'},
      body: {ar: 'إذا كان لك أكثر من ابن، أو في أكثر من مدرسة، فستجدهم هنا. اضغط على أحدهم لتعرض بياناته في كل الأقسام.', en: 'If you have several children, or children at different schools, they all appear here. Tap one to see their information in every section.'}},
    {id: 'sections', target: '[data-tour="sections"]', icon: 'dashboard', tone: 'blue',
      title: {ar: 'أقسام الصفحة', en: 'The sections'},
      body: {ar: 'نظرة عامة، ثم الحضور والغياب، ثم الحالات والمتابعة، ثم مقصف فسحتي. اضغط على أي قسم للانتقال إليه.', en: 'Overview, then Attendance, then Cases and follow-ups, then the Fushati cafeteria. Tap any section to open it.'}},
    {id: 'overview', target: '[data-tour="overview-stats"]', section: 'overview', icon: 'attendance', tone: 'green',
      title: {ar: 'الحضور في لمحة', en: 'Attendance at a glance'},
      body: {ar: 'أيام الحضور والتأخر والغياب وعدد الحالات المسجلة للابن المحدد. الأرقام تُحدَّث من سجلات المدرسة.', en: 'Days present, late and absent, and the number of recorded cases for the selected child. The numbers come straight from the school records.'}},
    {id: 'balance', target: '[data-tour="fsp-balance"]', section: 'cafeteria', icon: 'wallet', tone: 'amber',
      title: {ar: 'رصيد المقصف', en: 'Cafeteria balance'},
      body: {ar: 'رصيد ابنك الحالي وما صرفه اليوم وهذا الشهر وحدّه اليومي. إذا كان للمدرسة أكثر من مقصف فاختر المقصف أولاً.', en: "Your child's current balance, today's and this month's spending, and the daily limit. If the school has more than one cafeteria, pick it first."}},
    {id: 'topup', target: '[data-tour="fsp-topup"]', section: 'cafeteria:topup', icon: 'transfer', tone: 'blue',
      title: {ar: 'شحن الرصيد', en: 'Add credit'},
      body: {ar: 'حوّل المبلغ إلى حساب المقصف البنكي، ثم ارفع صورة الإيصال هنا. يُضاف الرصيد بعد أن يتحقق مدير المقصف من التحويل.', en: "Transfer the amount to the cafeteria's bank account, then upload the receipt here. The credit is added after the cafeteria administrator checks the transfer."}},
    {id: 'statement', target: '[data-tour="fsp-statement"]', section: 'cafeteria:statement', icon: 'history', tone: 'slate',
      title: {ar: 'كشف الحساب', en: 'Statement'},
      body: {ar: 'كل عملية شراء وشحن، وحالة كل حوالة: بانتظار المراجعة أو معتمدة أو مرفوضة، مع رابط الإيصال.', en: 'Every purchase and top-up, and the state of each transfer: waiting, approved or rejected, with a link to the receipt.'}},
    {id: 'rules', target: '[data-tour="fsp-rules"]', section: 'cafeteria:rules', icon: 'settings', tone: 'violet',
      title: {ar: 'تحكّم في المصروف', en: 'Control the spending'},
      body: {ar: 'حدّد الحد اليومي والشهري، واسمح بمنتجات معينة فقط، أو أوقف الشراء مؤقتاً.', en: 'Set a daily and monthly limit, allow only certain products, or pause purchases.'}},
    {id: 'card', target: '[data-tour="fsp-card"]', section: 'cafeteria:card', icon: 'card', tone: 'teal',
      title: {ar: 'بطاقة الطالب', en: 'Student card'},
      body: {ar: 'رمز QR دائم يُطبع ويُسلَّم لابنك ليشتري به من المقصف. إذا فُقدت البطاقة فألغها هنا وأصدر بطاقة جديدة.', en: 'A permanent QR code to print for your child to buy at the cafeteria. If the card is lost, cancel it here and print a new one.'}},
    {id: 'tools', target: '[data-tour="tools"]', icon: 'help', tone: 'amber',
      title: {ar: 'اللغة وكلمة المرور والمساعدة', en: 'Language, password and help'},
      body: {ar: 'بدّل بين العربية والإنجليزية، وحدّث البيانات، وغيّر كلمة المرور (12 حرفاً على الأقل). زر الجولة يعيد هذا الشرح متى شئت.', en: 'Switch between Arabic and English, refresh the data and change your password (at least 12 characters). The tour button plays this guide again whenever you like.'}},
  ],
  admin: [
    {id: 'welcome', icon: 'welcome', tone: 'violet',
      title: {ar: 'أهلاً بك في الإدارة المركزية', en: 'Welcome to Central Administration'},
      body: {ar: 'من هنا تدير المدارس وحسابات الوكلاء والمديرين والمقاصف، وتتابع ما يحتاج انتباهك. هذه جولة قصيرة تعرّفك على الأقسام، ويمكنك تخطيها في أي وقت.', en: 'Manage schools, agent and manager accounts and cafeterias, and follow what needs your attention. This short tour shows you the sections; you can skip it at any time.'}},
    {id: 'sections', target: '[data-tour="admin-sections"]', section: 'overview', icon: 'dashboard', tone: 'violet',
      title: {ar: 'أقسام الإدارة', en: 'The sections'},
      body: {ar: 'نظرة عامة، المدارس، المستخدمون، المقاصف، السجلات، الأمان. العدّاد على «نظرة عامة» يخبرك بعدد الأمور التي تحتاج انتباهاً.', en: 'Overview, Schools, Users, Cafeterias, Records and Security. The counter on Overview tells you how many things need attention.'}},
    {id: 'stats', target: '[data-tour="admin-stats"]', section: 'overview', icon: 'dashboard', tone: 'green',
      title: {ar: 'أرقام النظام', en: 'The numbers'},
      body: {ar: 'عدد المدارس والطلاب والحسابات النشطة، وما يحتاج انتباهاً مثل دعوة فشل إرسالها أو حساب لم يُفعَّل بعد.', en: 'Schools, students and active accounts, plus what needs attention such as a failed invitation or an account that is not activated yet.'}},
    {id: 'schools', target: '[data-tour="admin-schools"]', section: 'schools', icon: 'students', tone: 'green',
      title: {ar: 'المدارس', en: 'Schools'},
      body: {ar: 'كل مدرسة في بطاقة: افتحها بصلاحيات المدير، عدّل اسمها أو رمزها، أو أوقفها. الحذف النهائي يطلب رمز المدرسة للتأكيد.', en: 'Each school is a card: open it as administrator, edit its name or code, or disable it. Permanent deletion asks you to type the school code.'}},
    {id: 'create-school', target: '[data-tour="admin-create-school"]', section: 'schools', icon: 'settings', tone: 'teal',
      title: {ar: 'إنشاء مدرسة', en: 'Create a school'},
      body: {ar: 'أدخل الاسم ورمزاً قصيراً لا يتكرر والمنطقة والمدينة والمرحلة. بعدها ادعُ وكيل شؤون الطلاب إليها.', en: 'Enter the name, a short unique code, the province, city and stage. Then invite a Student Affairs Agent to it.'}},
    {id: 'users', target: '[data-tour="admin-users"]', section: 'users', icon: 'children', tone: 'blue',
      title: {ar: 'الوكلاء والمديرون', en: 'Agents and managers'},
      body: {ar: 'تتابع هنا حالة كل دعوة، وهل عيّن المستخدم كلمة المرور، وهل دخل أول مرة. يمكنك إعادة إرسال رابط الدخول أو إيقاف الحساب.', en: 'Follow each invitation, whether the user has set a password and whether they have signed in yet. You can resend the access link or disable the account.'}},
    {id: 'invite', target: '[data-tour="admin-invite"]', section: 'users', icon: 'messages', tone: 'green',
      title: {ar: 'دعوة مستخدم', en: 'Invite a user'},
      body: {ar: 'اختر الدور والمدرسة وأدخل البريد، فيصل المستخدم رابط آمن ليعيّن كلمة المرور بنفسه. مدير المدرسة يرى التقارير فقط.', en: 'Choose the role and school and enter the email; the user gets a secure link to set their own password. A School Manager can only view reports.'}},
    {id: 'cafeteria', target: '[data-tour="admin-cafeteria"]', section: 'cafeteria', icon: 'cafeteria', tone: 'amber',
      title: {ar: 'المقاصف (فسحتي)', en: 'Cafeterias (Fushati)'},
      body: {ar: 'إلى لوحة فسحتي: المقاصف وموظفوها ومديروها والحوالات والتقارير.', en: 'Go to the Fushati dashboard: cafeterias, their staff and administrators, transfers and reports.'}},
    {id: 'records', target: '[data-tour="admin-records"]', section: 'records', icon: 'shield', tone: 'red',
      title: {ar: 'السجلات (منطقة حساسة)', en: 'Records (sensitive area)'},
      body: {ar: 'للبحث في سجلات أي مدرسة وحذف سجل بعينه. الحذف نهائي، فاحتفظ بنسخة احتياطية قبله.', en: "Search any school's records and delete a single one. Deletion is permanent, so take a backup first."}},
    {id: 'security', target: '[data-tour="admin-security"]', section: 'security', icon: 'password', tone: 'slate',
      title: {ar: 'الأمان', en: 'Security'},
      body: {ar: 'غيّر بريد دخول مدير النظام أو كلمة المرور. يلزم تأكيد كلمة المرور الحالية، وتُغلق الجلسات السابقة.', en: 'Change the administrator login email or password. The current password is required and earlier sessions are closed.'}},
    {id: 'tools', target: '[data-tour="tools"]', icon: 'help', tone: 'amber',
      title: {ar: 'اللغة والتقارير والمساعدة', en: 'Language, reports and help'},
      body: {ar: 'بدّل اللغة، وافتح تقارير مدير المدرسة، وحدّث الصفحة. زر الجولة يعيد هذا الشرح متى شئت.', en: 'Switch language, open the manager reports and refresh the page. The tour button plays this guide again whenever you like.'}},
  ],
};

/** Source files that contain the data-tour markers of each platform. */
export const TOUR_SOURCES: Partial<Record<TourPlatform, string[]>> = {
  parent: ['app/parent/parent-portal.tsx', 'app/parent/fushati-parent.tsx'],
  admin: ['app/admin/admin-console.tsx'],
};
