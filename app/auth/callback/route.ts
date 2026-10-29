import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env.public';
import { safeNextPath } from '@/lib/supabase/proxy';
import { createClient } from '@/lib/supabase/server';

/** OAuth (PKCE) return URL: exchanges the code for a session, then continues. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${publicEnv.appUrl}${next}`);
    }
  }

  return NextResponse.redirect(`${publicEnv.appUrl}/sign-in?error=link`);
}
