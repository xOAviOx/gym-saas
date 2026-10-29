import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env.public';

import type { Database } from './database.types';

/** Routes that never need a signed-in user. */
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/auth',
  '/p',
  '/privacy',
  '/api',
];

/** Signed-in users are sent to the app instead of these pages. */
const AUTH_PAGES = ['/sign-in', '/sign-up', '/forgot-password'];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Only allow relative, same-origin paths as a post-login destination. */
export function safeNextPath(value: string | null | undefined, fallback = '/today'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}

/**
 * Refreshes the Supabase session cookie on every request and gates app routes.
 * Runs in proxy.ts, before any page renders.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getClaims() validates the JWT and refreshes it when needed; it must run
  // before any early return so the refreshed cookie is always written.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;

  const { pathname, search } = request.nextUrl;

  if (!userId && !matches(pathname, PUBLIC_PREFIXES) && pathname !== '/reset-password') {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    if (pathname !== '/') {
      url.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (userId && matches(pathname, AUTH_PAGES)) {
    const url = request.nextUrl.clone();
    url.pathname = safeNextPath(request.nextUrl.searchParams.get('next'));
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
