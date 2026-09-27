import { describe, it, expect } from 'vitest';
import { shouldSkipSessionApply } from './authEvents';

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
