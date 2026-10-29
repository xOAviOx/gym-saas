import {
  EllipsisIcon,
  HouseIcon,
  IndianRupeeIcon,
  ScanLineIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

import { copy } from '@/lib/copy';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** The five primary destinations, shared by the mobile bottom nav and the desktop sidebar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/today', label: copy.nav.today, icon: HouseIcon },
  { href: '/members', label: copy.nav.members, icon: UsersIcon },
  { href: '/dues', label: copy.nav.dues, icon: IndianRupeeIcon },
  { href: '/attendance', label: copy.nav.attendance, icon: ScanLineIcon },
  { href: '/more', label: copy.nav.more, icon: EllipsisIcon },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
