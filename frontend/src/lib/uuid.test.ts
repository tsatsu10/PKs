import { describe, it, expect, vi } from 'vitest';
import { uuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('uses crypto.randomUUID when the context has it', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    expect(uuid({ randomUUID, getRandomValues: vi.fn() } as unknown as Crypto)).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('builds a v4 UUID from getRandomValues in an insecure context (no randomUUID)', () => {
    const insecure = { getRandomValues: (a: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(a) } as unknown as Crypto;
    const ids = new Set(Array.from({ length: 200 }, () => uuid(insecure)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it('sets the version and variant bits whatever the random bytes are', () => {
    const allOnes = { getRandomValues: (a: Uint8Array) => a.fill(0xff) } as unknown as Crypto;
    const allZeros = { getRandomValues: (a: Uint8Array) => a.fill(0) } as unknown as Crypto;
    expect(uuid(allOnes)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuid(allZeros)).toBe('00000000-0000-4000-8000-000000000000');
  });
});
