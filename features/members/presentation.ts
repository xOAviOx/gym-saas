import { copy } from '@/lib/copy';
import { formatDate, relativeEndDate } from '@/lib/dates';

import type { DirectoryMember } from './types';

type MembershipContext = Pick<DirectoryMember, 'status' | 'startDate' | 'endDate'>;

export function membershipHint(member: MembershipContext, today: string): string {
  if (member.status === 'new' || !member.endDate) return copy.members.noMembership;
  if (member.status === 'upcoming' && member.startDate)
    return copy.memberships.startFuture(formatDate(member.startDate));
  if (member.status === 'frozen') return copy.memberships.paused;
  if (member.status === 'expired' && member.endDate >= today)
    return copy.memberships.sessionsExhausted;
  return relativeEndDate(member.endDate, today).label;
}

export function memberQuickAction(
  member: Pick<DirectoryMember, 'id' | 'status' | 'balanceDue' | 'deletedAt'>,
) {
  if (member.deletedAt) return null;
  if (['new', 'expired', 'expiring'].includes(member.status)) {
    return {
      href: `/members/${member.id}?action=renew`,
      label: member.status === 'new' ? copy.members.addMembership : copy.memberships.renew,
    };
  }
  if (member.balanceDue > 0) {
    return { href: `/members/${member.id}#member-dues`, label: copy.members.viewDues };
  }
  return null;
}
