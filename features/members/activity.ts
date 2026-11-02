import { copy } from '@/lib/copy';
import { formatMoney } from '@/lib/money';

import type { MemberPayment, Membership } from './types';

export type MemberActivityItem = {
  id: string;
  at: string;
  kind: keyof typeof copy.members.activityTypes;
  detail: string | null;
};

export function buildMemberActivity({
  createdAt,
  memberships,
  payments,
  attendance,
}: {
  createdAt: string;
  memberships: Pick<Membership, 'id' | 'created_at' | 'planName'>[];
  payments: Pick<MemberPayment, 'id' | 'paidAt' | 'amount' | 'isReversal' | 'invoiceNumber'>[];
  attendance: string[];
}): MemberActivityItem[] {
  const items: MemberActivityItem[] = [
    { id: 'member-created', at: createdAt, kind: 'joined', detail: null },
    ...memberships.map((m): MemberActivityItem => ({
      id: `membership:${m.id}`,
      at: m.created_at,
      kind: 'membership',
      detail: m.planName,
    })),
    ...payments.map((p): MemberActivityItem => ({
      id: `payment:${p.id}`,
      at: p.paidAt,
      kind: p.isReversal ? 'reversal' : 'payment',
      detail: copy.members.activityPayment(formatMoney(p.amount), p.invoiceNumber),
    })),
    ...attendance.map((at, index): MemberActivityItem => ({
      id: `check-in:${at}:${index}`,
      at,
      kind: 'checkIn',
      detail: null,
    })),
  ];
  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, 6);
}
