import { describe, it, expect, beforeEach } from 'vitest';
import {
  USER_LOCAL_STORAGE_KEYS,
  ORPHANED_LOCAL_STORAGE_KEYS,
  clearUserLocalData,
  clearOrphanedLocalData,
  clearUserData,
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
