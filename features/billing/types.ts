import type { Paise } from '@/lib/money';
import type { Enums } from '@/lib/supabase/types';

import type { DuesFilter } from './schema';

export type InvoiceStatus = Enums<'invoice_status'>;
export type PaymentMethod = Enums<'payment_method'>;
export type ClaimStatus = Enums<'payment_claim_status'>;
export type LinkStatus = Enums<'collection_request_status'>;

export type DuesRow = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  total: Paise;
  paid: Paise;
  balance: Paise;
  status: InvoiceStatus;
  memberId: string;
  memberCode: string;
  fullName: string;
  phone: string;
  pendingClaims: number;
  openLink: boolean;
};

export type DuesSummary = {
  outstanding: Paise;
  overdue: Paise;
  counts: Record<DuesFilter, number>;
};

export type InvoicePayment = {
  id: string;
  amount: Paise;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  isReversal: boolean;
  reversesPaymentId: string | null;
  reversalReason: string | null;
  reversed: boolean;
};

export type InvoiceClaim = {
  id: string;
  amount: Paise;
  utr: string;
  note: string | null;
  claimedAt: string;
  status: ClaimStatus;
  rejectReason: string | null;
};

export type GatewayLink = {
  id: string;
  amount: Paise;
  url: string | null;
  status: LinkStatus;
  expiresAt: string;
  createdAt: string;
  /** Pending and not past its expiry time. */
  isOpen: boolean;
};

export type InvoiceDetail = {
  id: string;
  number: string;
  fiscalYear: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: Paise;
  discount: Paise;
  taxable: Paise;
  gstRate: number;
  cgst: Paise;
  sgst: Paise;
  total: Paise;
  paid: Paise;
  balance: Paise;
  voidReason: string | null;
  voidedAt: string | null;
  items: { id: string; description: string; sac: string; amount: Paise }[];
  member: {
    id: string;
    fullName: string;
    memberCode: string;
    phone: string;
    consentMessaging: boolean;
    deleted: boolean;
  };
  payments: InvoicePayment[];
  claims: InvoiceClaim[];
  links: GatewayLink[];
};
