import { describe, it, expect, beforeEach } from 'vitest';
import {
  USER_LOCAL_STORAGE_KEYS,
  ORPHANED_LOCAL_STORAGE_KEYS,
  clearUserLocalData,
  clearOrphanedLocalData,
  clearUserData,
  claimUserData,
  shouldClearForOwner,
  DRAFT_OWNER_KEY,
  DATA_OWNER_KEY,
} from './userStorage';
import { SAVED_FILTERS_KEY } from '../features/dashboard/lib/dashboardUtils';
import { RUN_PROMPT_STORAGE_KEY } from '../constants';
import { setDraft, getDraft, DRAFT_KEYS } from './draftStorage';

const DEVICE_KEYS = ['pks-theme', 'pks-sidebar-collapsed', 'pks-dashboard-density', 'pks-dashboard-view', 'pks-onboarding-dismissed'];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('clearUserLocalData', () => {
  it('removes per-user keys (saved filters and the orphaned keys) and keeps device preferences', () => {
    localStorage.setItem(SAVED_FILTERS_KEY, '[{"id":"saved-1"}]');
    localStorage.setItem('pks-pulse-targets', '{}');
    localStorage.setItem('pks-main-menu-deck', '[]');
    DEVICE_KEYS.forEach((k) => localStorage.setItem(k, 'keep'));
    clearUserLocalData();
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBeNull();
    expect(localStorage.getItem('pks-pulse-targets')).toBeNull();
    expect(localStorage.getItem('pks-main-menu-deck')).toBeNull();
    DEVICE_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBe('keep'));
  });

  it('lists saved filters as per-user and never a device preference', () => {
    expect(USER_LOCAL_STORAGE_KEYS).toContain(SAVED_FILTERS_KEY);
    DEVICE_KEYS.forEach((k) => expect(USER_LOCAL_STORAGE_KEYS).not.toContain(k));
  });
});

describe('clearOrphanedLocalData', () => {
  it('removes only the keys left behind by deleted features', () => {
    expect(ORPHANED_LOCAL_STORAGE_KEYS).toEqual(['pks-pulse-targets', 'pks-main-menu-deck']);
    localStorage.setItem('pks-pulse-targets', '{}');
    localStorage.setItem('pks-main-menu-deck', '[]');
    localStorage.setItem(SAVED_FILTERS_KEY, '[]');
    clearOrphanedLocalData();
    expect(localStorage.getItem('pks-pulse-targets')).toBeNull();
    expect(localStorage.getItem('pks-main-menu-deck')).toBeNull();
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBe('[]');
  });
});

describe('clearUserData', () => {
  it('clears drafts, the pending run prompt and per-user localStorage in one call', () => {
    sessionStorage.setItem(DRAFT_OWNER_KEY, 'u1');
    setDraft(DRAFT_KEYS.new, { form: { title: 'secret' } });
    sessionStorage.setItem(RUN_PROMPT_STORAGE_KEY, '{"id":"p1"}');
    sessionStorage.setItem('other-app-key', 'keep');
    localStorage.setItem(SAVED_FILTERS_KEY, '[{"id":"saved-1"}]');
    localStorage.setItem('pks-theme', 'dark');
    clearUserData();
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(sessionStorage.getItem(RUN_PROMPT_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem('other-app-key')).toBe('keep');
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBeNull();
    expect(localStorage.getItem('pks-theme')).toBe('dark');
  });

  it('does not touch the explicit-logout mark (it must survive until the other tabs see SIGNED_OUT)', () => {
    localStorage.setItem('pks-explicit-logout', '123');
    clearUserData();
    expect(localStorage.getItem('pks-explicit-logout')).toBe('123');
  });
});

describe('shouldClearForOwner', () => {
  it('keeps data for the same user and when no owner was recorded', () => {
    expect(shouldClearForOwner('u1', 'u1')).toBe(false);
    expect(shouldClearForOwner(null, 'u1')).toBe(false);
  });

  it('clears data recorded for a different user', () => {
    expect(shouldClearForOwner('u1', 'u2')).toBe(true);
  });
});

describe('claimUserData (a user becomes signed in)', () => {
  function seed() {
    // Written directly: setDraft refuses to write while the tab has no owner,
    // and the "unowned data" case needs a draft left by an older build.
    sessionStorage.setItem(DRAFT_KEYS.new, JSON.stringify({ form: { title: 'unsaved' } }));
    sessionStorage.setItem(RUN_PROMPT_STORAGE_KEY, '{"id":"p1"}');
    localStorage.setItem(SAVED_FILTERS_KEY, '[{"id":"saved-1"}]');
    localStorage.setItem('pks-theme', 'dark');
  }

  it('same user signs back in after an expiry: drafts, run prompt and saved filters are kept', () => {
    claimUserData('u1');
    seed();
    // session expires: nothing is cleared, the owner markers stay
    claimUserData('u1');
    expect(getDraft(DRAFT_KEYS.new)).toEqual({ form: { title: 'unsaved' } });
    expect(sessionStorage.getItem(RUN_PROMPT_STORAGE_KEY)).toBe('{"id":"p1"}');
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBe('[{"id":"saved-1"}]');
    expect(sessionStorage.getItem(DRAFT_OWNER_KEY)).toBe('u1');
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBe('u1');
  });

  it('a different user signs in: the previous user\'s data is cleared and the owner becomes the new user', () => {
    claimUserData('u1');
    seed();
    claimUserData('u2');
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(sessionStorage.getItem(RUN_PROMPT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBeNull();
    expect(localStorage.getItem('pks-theme')).toBe('dark');
    expect(sessionStorage.getItem(DRAFT_OWNER_KEY)).toBe('u2');
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBe('u2');
  });

  it('checks the tab owner separately: a tab holding u1 drafts clears them even after another tab already claimed shared data for u2', () => {
    claimUserData('u1');
    seed();
    localStorage.setItem(DATA_OWNER_KEY, 'u2'); // another tab signed u2 in first
    claimUserData('u2');
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(sessionStorage.getItem(RUN_PROMPT_STORAGE_KEY)).toBeNull();
  });

  it('adopts unowned data (written before owners were recorded) instead of discarding it', () => {
    seed();
    claimUserData('u1');
    expect(getDraft(DRAFT_KEYS.new)).not.toBeNull();
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).not.toBeNull();
  });

  it('deliberate logout (clearUserData) clears the data and the owner markers', () => {
    claimUserData('u1');
    seed();
    clearUserData();
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(localStorage.getItem(SAVED_FILTERS_KEY)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_OWNER_KEY)).toBeNull();
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBeNull();
  });
});
