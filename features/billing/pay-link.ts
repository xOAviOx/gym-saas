import 'server-only';

import { env } from '@/lib/env';
import { createPayToken } from '@/lib/payments/pay-token';

/** Public, signed page where the member pays one invoice. */
export function payLinkFor(invoiceId: string): { url: string; expiresAt: Date } {
  const { token, expiresAt } = createPayToken(invoiceId, env.PORTAL_TOKEN_SECRET);
  return { url: `${env.NEXT_PUBLIC_APP_URL}/p/pay/${token}`, expiresAt };
}
