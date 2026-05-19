import { describe, it, expect } from 'vitest';
import { getTimeBucketLabel, buildStreamVirtualItems } from './streamBuckets';

describe('streamBuckets', () => {
  it('labels today for recent updates', () => {
    const now = new Date();
    expect(getTimeBucketLabel(now.toISOString())).toBe('Today');
  });

  it('builds headers and rows', () => {
    const now = new Date().toISOString();
    const items = buildStreamVirtualItems([
      { id: 'a', updated_at: now },
      { id: 'b', updated_at: now },
    ]);
    expect(items.some((i) => i.kind === 'header')).toBe(true);
    expect(items.filter((i) => i.kind === 'row')).toHaveLength(2);
  });
});
