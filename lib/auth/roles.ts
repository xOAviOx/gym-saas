export type Role = 'owner' | 'manager' | 'staff';

export const ALL_ROLES: readonly Role[] = ['owner', 'manager', 'staff'];
export const PRIVILEGED_ROLES: readonly Role[] = ['owner', 'manager'];
export const OWNER_ONLY: readonly Role[] = ['owner'];

export function isPrivileged(role: Role): boolean {
  return role === 'owner' || role === 'manager';
}

/** Permission checks mirror the RLS policies and SQL guards; the UI uses them to hide what a role cannot do. */
export const can = {
  manageSettings: (role: Role) => isPrivileged(role),
  managePlans: (role: Role) => isPrivileged(role),
  manageTeam: (role: Role) => isPrivileged(role),
  viewExpenses: (role: Role) => isPrivileged(role),
  viewReports: (role: Role) => isPrivileged(role),
  voidInvoices: (role: Role) => isPrivileged(role),
  reversePayments: (role: Role) => isPrivileged(role),
  deleteMembers: (role: Role) => isPrivileged(role),
  deleteGym: (role: Role) => role === 'owner',
  changeOwner: (role: Role) => role === 'owner',
  viewAuditLog: (role: Role) => role === 'owner',
  purgeMemberData: (role: Role) => role === 'owner',
} as const;
