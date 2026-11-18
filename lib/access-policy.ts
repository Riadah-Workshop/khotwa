// These accounts may browse the application but may not change shared records.
export const READ_ONLY_MESSAGE = 'حسابك للمشاهدة فقط؛ لا يمكنك إضافة السجلات أو تعديلها أو حذفها.';
const READ_ONLY_EMAILS = new Set(['aboabdo140@yahoo.com', 'ccsit@iau.edu.sa', 'alanoudayed249@gmail.com']);
export function isReadOnlyEmail(email: string | null | undefined): boolean {
  return READ_ONLY_EMAILS.has(email?.trim().toLowerCase() || '');
}
export function readOnlyWriteResponse(email: string | null | undefined): Response | null {
  return isReadOnlyEmail(email)
    ? Response.json({error: READ_ONLY_MESSAGE}, {status: 403, headers: {'Cache-Control': 'no-store'}})
    : null;
}
