import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env.public';
import { safeNextPath } from '@/lib/supabase/proxy';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

/** Email link landing: verifies the token hash (sign-up confirmation, password recovery). */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === 'recovery' ? '/reset-password' : next;
      return NextResponse.redirect(`${publicEnv.appUrl}${destination}`);
    }
  }

  return NextResponse.redirect(`${publicEnv.appUrl}/sign-in?error=link`);
}
