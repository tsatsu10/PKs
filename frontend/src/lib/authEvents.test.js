import { describe, it, expect } from 'vitest';
import { shouldSkipSessionApply, resolveSessionEvent } from './authEvents';

const session = { user: { id: 'u1' }, access_token: 't' };

describe('shouldSkipSessionApply', () => {
  it('skips repeat events for the already-loaded user (tab refocus, token refresh, initial session)', () => {
    expect(shouldSkipSessionApply('SIGNED_IN', session, 'u1')).toBe(true);
    expect(shouldSkipSessionApply('TOKEN_REFRESHED', session, 'u1')).toBe(true);
    expect(shouldSkipSessionApply('INITIAL_SESSION', session, 'u1')).toBe(true);
  });

  it('applies when the user changes or none is loaded yet', () => {
    expect(shouldSkipSessionApply('SIGNED_IN', session, 'u2')).toBe(false);
    expect(shouldSkipSessionApply('SIGNED_IN', session, null)).toBe(false);
  });

  it('applies profile-changing events even for the same user', () => {
    expect(shouldSkipSessionApply('USER_UPDATED', session, 'u1')).toBe(false);
  });

  it('never skips when there is no session', () => {
    expect(shouldSkipSessionApply('SIGNED_OUT', null, 'u1')).toBe(false);
  });
});

describe('resolveSessionEvent', () => {
  it('skips same-user repeat events once the profile has loaded', () => {
    expect(resolveSessionEvent('SIGNED_IN', session, 'u1', true)).toBe('skip');
    expect(resolveSessionEvent('TOKEN_REFRESHED', session, 'u1', true)).toBe('skip');
    expect(resolveSessionEvent('INITIAL_SESSION', session, 'u1', true)).toBe('skip');
  });

  it('re-verifies same-user repeat events when the profile never loaded (offline boot)', () => {
    expect(resolveSessionEvent('SIGNED_IN', session, 'u1', false)).toBe('reverify');
    expect(resolveSessionEvent('TOKEN_REFRESHED', session, 'u1', false)).toBe('reverify');
    expect(resolveSessionEvent('INITIAL_SESSION', session, 'u1', false)).toBe('reverify');
  });

  it('applies user changes, USER_UPDATED and sign-out regardless of enrichment', () => {
    expect(resolveSessionEvent('SIGNED_IN', session, 'u2', true)).toBe('apply');
    expect(resolveSessionEvent('SIGNED_IN', session, null, false)).toBe('apply');
    expect(resolveSessionEvent('USER_UPDATED', session, 'u1', true)).toBe('apply');
    expect(resolveSessionEvent('SIGNED_OUT', null, 'u1', false)).toBe('apply');
  });
});
