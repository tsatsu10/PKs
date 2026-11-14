import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
vi.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));

import { scrub, reportError, resetReporterForTests, installGlobalErrorReporting } from './reportError';

const serverErr = (message = 'boom') => ({ code: 'PGRST000', message, details: 'Key (title)=(Secret)', hint: '' });

describe('scrub', () => {
  it('removes emails, JWTs, row values and URL query/hash', () => {
    const out = scrub(
      'a@b.co eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig Key (title)=(My (private) note) ' +
      'https://pks2.vercel.app/objects/1?x=1#access_token=abc',
    );
    expect(out).not.toMatch(/a@b\.co|eyJ|private|x=1|access_token/);
    expect(out).toContain('[email]');
    expect(out).toContain('[jwt]');
    expect(out).toContain('(title)=([value])');
    expect(out).toContain('https://pks2.vercel.app/objects/1');
  });
});

describe('reportError', () => {
  beforeEach(() => { rpc.mockClear(); resetReporterForTests(); onlineManager.setOnline(true); });
  afterEach(() => { vi.useRealTimers(); onlineManager.setOnline(true); });

  it('sends server errors with path-only route and no details', () => {
    window.history.pushState({}, '', '/objects/1?q=secret#t=1');
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('report_client_error');
    expect(args.p_kind).toBe('server');
    expect(args.p_route).toBe('/objects/1');
    expect(JSON.stringify(args)).not.toContain('Secret');
    expect(args.p_app_version).toBe('dev');
  });

  it('skips expected kinds and app-authored messages', () => {
    reportError({ code: '23505', message: 'duplicate key' });
    reportError({ message: 'TypeError: Failed to fetch' });
    reportError(new Error('Name is required'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports permission errors and programming errors', () => {
    reportError({ code: '42501', message: 'permission denied' });
    reportError(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('sends nothing while offline', () => {
    onlineManager.setOnline(false);
    reportError(serverErr());
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dedupes the same fingerprint for 60 s', () => {
    vi.useFakeTimers();
    reportError(serverErr());
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    reportError(serverErr());
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('caps a session at 20 reports', () => {
    for (let i = 0; i < 25; i += 1) reportError(serverErr(`boom ${i}`));
    expect(rpc).toHaveBeenCalledTimes(20);
  });

  it('never throws, even when the RPC rejects', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('down')));
    expect(() => reportError(serverErr())).not.toThrow();
    await Promise.resolve();
  });

  it('global hooks report window errors and unhandled rejections', () => {
    const remove = installGlobalErrorReporting(window);
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is undefined') }));
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new RangeError('bad');
    window.dispatchEvent(rejection);
    remove();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
