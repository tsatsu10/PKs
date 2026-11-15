import { describe, it, expect, vi, afterEach } from 'vitest';
import { browserTimeZone } from './timezone';

describe('browserTimeZone', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns the browser's IANA zone", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Europe/Berlin' } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimeZone()).toBe('Europe/Berlin');
  });

  it('falls back to UTC when Intl throws', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => { throw new Error('no Intl'); });
    expect(browserTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when the zone is empty', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimeZone()).toBe('UTC');
  });
});
