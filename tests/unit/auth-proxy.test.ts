import type { CookieOptions } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safeNextPath, updateSession } from '@/lib/supabase/proxy';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/lib/env.public', () => ({
  publicEnv: {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseAnonKey: 'test-anon-key',
  },
}));

type SessionCookie = { name: string; value: string; options?: CookieOptions };
type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: SessionCookie[]) => void;
};
let cookies: CookieAdapter;
const origin = 'http://gymdesk.test:3000';

function setUser(id: string | null, refreshedCookies: SessionCookie[] = []) {
  mocks.getUser.mockImplementation(async () => {
    if (refreshedCookies.length) cookies.setAll(refreshedCookies);
    return { data: { user: id ? { id } : null }, error: null };
  });
  mocks.getClaims.mockImplementation(async () => {
    if (refreshedCookies.length) cookies.setAll(refreshedCookies);
    return {
      data: id ? { claims: { sub: id } } : null,
      error: id ? null : { code: 'session_not_found' },
    };
  });
}

function request(path: string) {
  // NextURL canonicalizes loopback hosts, so use a reserved host for route assertions.
  return new NextRequest(`${origin}${path}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieAdapter }) => {
      cookies = options.cookies;
      return { auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } };
    },
  );
  setUser(null);
});

describe('authentication proxy', () => {
  it('breaks the sign-in loop when a valid JWT belongs to a deleted account', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'deleted-user' } }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'user_not_found' },
    });

    const protectedResponse = await updateSession(request('/today'));
    expect(protectedResponse.headers.get('location')).toBe(`${origin}/sign-in?next=%2Ftoday`);
    const signInResponse = await updateSession(request('/sign-in?next=%2Ftoday'));
    expect(signInResponse.headers.get('location')).toBeNull();
    expect(signInResponse.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it.each(['/sign-in', '/sign-up', '/forgot-password'])(
    'allows a guest to reach %s',
    async (path) => {
      const response = await updateSession(request(path));
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('keeps the protected path and search in the sign-in destination', async () => {
    const response = await updateSession(request('/members?q=sample&page=2'));
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/sign-in');
    expect(destination.searchParams.get('next')).toBe('/members?q=sample&page=2');
  });

  it('allows a verified user to reach an app page', async () => {
    setUser('verified-user');
    const response = await updateSession(request('/today'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('preserves a safe post-login query and fragment for an authenticated user', async () => {
    setUser('verified-user');
    const response = await updateSession(
      request(`/sign-in?next=${encodeURIComponent('/members?filter=expiring#member-dues')}`),
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/members');
    expect(destination.searchParams.get('filter')).toBe('expiring');
    expect(destination.hash).toBe('#member-dues');
  });

  it('copies refreshed cookies onto an authenticated redirect', async () => {
    setUser('verified-user', [
      {
        name: 'sb-session',
        value: 'refreshed-test-session',
        options: { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 3600 },
      },
    ]);
    const response = await updateSession(request('/sign-in'));
    expect(response.cookies.get('sb-session')).toMatchObject({
      value: 'refreshed-test-session',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 3600,
    });
    expect(response.headers.get('location')).toBe(`${origin}/today`);
  });

  it('copies cookie removal onto a guest redirect', async () => {
    setUser(null, [
      { name: 'sb-session', value: '', options: { path: '/', maxAge: 0, sameSite: 'lax' } },
    ]);
    const response = await updateSession(request('/today'));
    expect(response.cookies.get('sb-session')).toMatchObject({ value: '', path: '/', maxAge: 0 });
  });

  it('keeps refreshed cookies on an ordinary non-redirect response', async () => {
    setUser('verified-user', [
      { name: 'sb-session', value: 'refreshed-test-session', options: { path: '/' } },
    ]);
    const response = await updateSession(request('/members'));
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed-test-session');
    expect(cookies.getAll()).toContainEqual({
      name: 'sb-session',
      value: 'refreshed-test-session',
    });
  });

  it('keeps password recovery reachable without a current user', async () => {
    const response = await updateSession(request('/reset-password'));
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('safe post-login paths', () => {
  it.each([
    [undefined, '/today'],
    ['https://example.test', '/today'],
    ['//example.test', '/today'],
    ['/\\example.test', '/today'],
    ['/\n/example.test', '/today'],
    ['/\t/example.test', '/today'],
    ['/members?filter=expiring#member-dues', '/members?filter=expiring#member-dues'],
    ['/members?q=Test member', '/members?q=Test%20member'],
  ])('normalizes %j without leaving the app', (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });
});
