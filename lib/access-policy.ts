// Only the school-side staff roles may create, change or delete agent records:
// the system administrator (main_admin) and the Student Affairs Agent (deputy).
// Every other signed-in role (school manager, parent, cafeteria roles) is
// read-only on these routes. The gateway already confines those roles to their own
// pages and APIs; this is the second, per-route layer of the same rule.
//
// A request without a role (for example a service caller that authenticates with
// its own secret key) is not treated as read-only here; the route performs its own
// secret check. Nothing is decided by an e-mail address.
export const READ_ONLY_MESSAGE = 'حسابك للمشاهدة فقط؛ لا يمكنك إضافة السجلات أو تعديلها أو حذفها.';
export function isReadOnlyRole(role: string | null | undefined): boolean {
  return !!role && role !== 'main_admin' && role !== 'deputy';
}
export function readOnlyWriteResponse(role: string | null | undefined): Response | null {
  return isReadOnlyRole(role)
    ? Response.json({error: READ_ONLY_MESSAGE}, {status: 403, headers: {'Cache-Control': 'no-store'}})
    : null;
}
