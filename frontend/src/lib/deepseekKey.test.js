import { describe, it, expect } from 'vitest';
import { normalizeDeepSeekApiKey, validateDeepSeekApiKey, getDeepSeekErrorMessage } from './deepseekKey';

describe('deepseekKey', () => {
  it('strips Bearer prefix', () => {
    expect(normalizeDeepSeekApiKey('Bearer sk-abc')).toBe('sk-abc');
  });

  it('rejects JWT-like keys', () => {
    const r = validateDeepSeekApiKey('eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(r.ok).toBe(false);
  });

  it('accepts sk- keys', () => {
    const r = validateDeepSeekApiKey('sk-test-key-123');
    expect(r.ok).toBe(true);
    expect(r.key).toBe('sk-test-key-123');
  });

  it('maps unsupported token algorithm error', () => {
    expect(getDeepSeekErrorMessage('UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM', 'x')).toMatch(/platform\.deepseek\.com/);
  });
});
