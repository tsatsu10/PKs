import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isoToDateTimeLocal, dateTimeLocalToIso } from './datetime';

// Node applies TZ changes at runtime. A non-UTC zone reproduces bug B6 even when CI runs in UTC.
// vi.stubEnv avoids the `process` global (not in the browser ESLint globals) and restores cleanly.
beforeAll(() => { vi.stubEnv('TZ', 'America/New_York'); });
afterAll(() => { vi.unstubAllEnvs(); });

describe('datetime-local conversion', () => {
  it('round-trips an ISO instant through the input value unchanged', () => {
    const iso = '2026-03-10T15:30:00.000Z';
    expect(dateTimeLocalToIso(isoToDateTimeLocal(iso))).toBe(iso);
  });

  it('shows local wall-clock time, not UTC', () => {
    // 15:30 UTC on 10 Mar 2026 is 11:30 in New York (EDT, UTC-4)
    expect(isoToDateTimeLocal('2026-03-10T15:30:00.000Z')).toBe('2026-03-10T11:30');
  });

  it('handles empty and invalid values', () => {
    expect(isoToDateTimeLocal(null)).toBe('');
    expect(isoToDateTimeLocal('not a date')).toBe('');
    expect(dateTimeLocalToIso('')).toBeNull();
    expect(dateTimeLocalToIso(undefined)).toBeNull();
  });
});
