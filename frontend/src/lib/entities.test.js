import { describe, it, expect } from 'vitest';

describe('entities', () => {
  it('createDomain rejects empty names via normalize', async () => {
    const { createDomain } = await import('./entities');
    await expect(createDomain('   ')).rejects.toThrow(/required/i);
  });
});
