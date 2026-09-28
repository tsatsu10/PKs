import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldSkipSessionApply,
  resolveSessionEvent,
  resolveSignOut,
  EXPLICIT_LOGOUT_WINDOW_MS,
  EXPLICIT_LOGOUT_KEY,
  markExplicitLogout,
  readExplicitLogoutMark,
  clearExplicitLogoutMark,
  shouldIgnoreWhileLoggingOut,
  isSameUser,
} from './authEvents';

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

describe('resolveSignOut', () => {
  const now = 1_000_000;

  it('treats a fresh logout mark as a deliberate sign-out (logout in another tab)', () => {
    expect(resolveSignOut(true, now - 500, now)).toBe('logout');
    expect(resolveSignOut(true, now - EXPLICIT_LOGOUT_WINDOW_MS, now)).toBe('logout');
    expect(resolveSignOut(false, now, now)).toBe('logout');
  });

  it('treats a sign-out with no (or a stale) mark as an expiry when a user was loaded', () => {
    expect(resolveSignOut(true, null, now)).toBe('expired');
    expect(resolveSignOut(true, now - EXPLICIT_LOGOUT_WINDOW_MS - 1, now)).toBe('expired');
  });

  it('ignores a mark from the future (clock change) rather than trusting it forever', () => {
    expect(resolveSignOut(true, now + 60_000, now)).toBe('expired');
  });

  it('is a plain sign-out when no user was loaded and no mark exists', () => {
    expect(resolveSignOut(false, null, now)).toBe('none');
    expect(resolveSignOut(false, now - 60_000, now)).toBe('none');
  });
});

describe('explicit logout mark', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage and is removed by clearExplicitLogoutMark', () => {
    expect(readExplicitLogoutMark()).toBeNull();
    markExplicitLogout(1234);
    expect(localStorage.getItem(EXPLICIT_LOGOUT_KEY)).toBe('1234');
    expect(readExplicitLogoutMark()).toBe(1234);
    clearExplicitLogoutMark();
    expect(readExplicitLogoutMark()).toBeNull();
  });

  it('reads garbage as no mark', () => {
    localStorage.setItem(EXPLICIT_LOGOUT_KEY, 'not-a-number');
    expect(readExplicitLogoutMark()).toBeNull();
  });
});

describe('shouldIgnoreWhileLoggingOut', () => {
  it('drops every event except SIGNED_OUT while a logout is pending', () => {
    expect(shouldIgnoreWhileLoggingOut('TOKEN_REFRESHED', true)).toBe(true);
    expect(shouldIgnoreWhileLoggingOut('SIGNED_IN', true)).toBe(true);
    expect(shouldIgnoreWhileLoggingOut('INITIAL_SESSION', true)).toBe(true);
    expect(shouldIgnoreWhileLoggingOut('SIGNED_OUT', true)).toBe(false);
  });

  it('ignores nothing when no logout is pending', () => {
    expect(shouldIgnoreWhileLoggingOut('SIGNED_IN', false)).toBe(false);
    expect(shouldIgnoreWhileLoggingOut('SIGNED_OUT', false)).toBe(false);
  });
});

describe('isSameUser', () => {
  const base = { id: 'u1', email: 'a@b.c', displayName: 'A', timezone: 'UTC', createdAt: '2026-01-01' };

  it('is true for a re-mapped user with identical fields (a new object)', () => {
    expect(isSameUser(base, { ...base })).toBe(true);
  });

  it('is false when any relevant field differs', () => {
    expect(isSameUser(base, { ...base, id: 'u2' })).toBe(false);
    expect(isSameUser(base, { ...base, email: 'x@y.z' })).toBe(false);
    expect(isSameUser(base, { ...base, displayName: 'B' })).toBe(false);
    expect(isSameUser(base, { ...base, timezone: 'Africa/Accra' })).toBe(false);
    expect(isSameUser(base, { ...base, createdAt: '2026-02-02' })).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isSameUser(null, base)).toBe(false);
    expect(isSameUser(base, null)).toBe(false);
  });
});
