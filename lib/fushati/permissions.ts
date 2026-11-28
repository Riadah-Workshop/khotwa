// What a user may do inside one cafeteria. Pure data and helpers (no database), so the rules can be
// read, tested and reused by the route and the screens.
//
//   system administrator (main_admin)   every permission in every cafeteria
//   cafeteria administrator             every permission, only in the cafeterias assigned to him
//   cafeteria agent                     only the permissions granted to him, only in his cafeterias
//                                       (an agent with more than the defaults is a "supervisor")
//
// Granting is done by the cafeteria administrator (or the system administrator) and can never exceed
// the cafeterias the grantor administers.
export const FUSHATI_PERMISSIONS = [
  'pos', // scan students and sell at the counter
  'menu_propose', // propose a new menu item (it waits for a price and approval)
  'menu_manage', // create, price, edit and remove menu items
  'inventory_view', // see stock quantities
  'inventory_manage', // adjust stock and stock tracking
  'sales_view', // sales totals and purchase history
  'balances_view', // student account balances and limits
  'transfers_review', // approve or reject parents' bank transfers
  'reports', // export reports
  'presence_view', // administrators only: see when agents arrived at and left the cafeteria (never granted to an agent)
] as const;

export type FushatiPermission = (typeof FUSHATI_PERMISSIONS)[number];

/** What an ordinary agent has until someone grants more. */
export const AGENT_DEFAULT_PERMISSIONS: readonly FushatiPermission[] = ['pos', 'menu_propose'];

const KNOWN = new Set<string>(FUSHATI_PERMISSIONS);

/**
 * What an agent can never be given, whoever asks: arrivals and departures are recorded about the agents and shown to
 * administrators only. The permission still exists (administrators have it) but is dropped from every agent's list.
 */
export const ADMIN_ONLY_PERMISSIONS: readonly FushatiPermission[] = ['presence_view'];

/** Keeps only known permission names an agent may hold, once each, in the canonical order. */
export function cleanPermissions(input: unknown): FushatiPermission[] {
  const wanted = new Set(Array.isArray(input) ? input.filter((value): value is string => typeof value === 'string') : []);
  return FUSHATI_PERMISSIONS.filter((permission) => wanted.has(permission) && !ADMIN_ONLY_PERMISSIONS.includes(permission));
}

/** Reads the stored JSON array; anything unreadable grants nothing. */
export function parsePermissions(raw: unknown): FushatiPermission[] {
  if (typeof raw !== 'string') return cleanPermissions(raw);
  try {
    return cleanPermissions(JSON.parse(raw));
  } catch {
    return [];
  }
}

export const isKnownPermission = (value: string): value is FushatiPermission => KNOWN.has(value);

/** One user's standing in one cafeteria. */
export type CafeteriaGrant = {
  cafeteriaId: string;
  /** 'platform' = system administrator, 'admin' = cafeteria administrator, 'staff' = agent or supervisor */
  level: 'platform' | 'admin' | 'staff';
  permissions: ReadonlySet<FushatiPermission>;
};

export const allPermissions = (): ReadonlySet<FushatiPermission> => new Set(FUSHATI_PERMISSIONS);

export const grantAllows = (grant: CafeteriaGrant | undefined, permission: FushatiPermission): boolean => !!grant && grant.permissions.has(permission);

/** May this grant add, change or remove users and grants in the cafeteria? Administrators only. */
export const grantAdministers = (grant: CafeteriaGrant | undefined): boolean => !!grant && grant.level !== 'staff';
