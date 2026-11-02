import type { MemberState } from '@/lib/membership';
import type { Tables } from '@/lib/supabase/types';

import type { MemberFilter } from './schema';

export type DirectoryOverview = {
  counts: Record<Exclude<MemberFilter, 'deleted'>, number> & { deleted?: number };
  balanceDue: number;
};

export type DirectoryMember = {
  id: string;
  memberCode: string;
  fullName: string;
  phone: string;
  status: MemberState;
  planName: string | null;
  startDate: string | null;
  endDate: string | null;
  balanceDue: number;
  deletedAt: string | null;
};

export type Membership = Omit<
  Tables<'memberships'>,
  'list_price' | 'discount_amount' | 'final_amount'
> & {
  planName: string;
  listPrice: number;
  discountAmount: number;
  finalAmount: number;
};

export type MemberInvoice = {
  id: string;
  number: string;
  dueDate: string;
  balanceDue: number;
};
export type MemberPayment = {
  id: string;
  paidAt: string;
  amount: number;
  method: Tables<'payments'>['method'];
  reference: string | null;
  isReversal: boolean;
  invoiceNumber: string;
};
