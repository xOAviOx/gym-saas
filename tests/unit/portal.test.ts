import { describe, expect, it } from 'vitest';

import { createPortalToken, hashPortalToken } from '@/features/portal/token';

describe('member portal token', () => {
  it('creates a unique opaque token and stores only its purpose-bound hash', () => {
    const first = createPortalToken();
    const second = createPortalToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashPortalToken(first.token));
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(hashPortalToken('invalid')).toBeNull();
  });
});
