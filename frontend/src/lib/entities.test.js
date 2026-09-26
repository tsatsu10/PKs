import { describe, it, expect, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
  },
}));

describe('entities', () => {
  it('createDomain rejects empty names via normalize', async () => {
    const { createDomain } = await import('./entities');
    await expect(createDomain('   ')).rejects.toThrow(/required/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
