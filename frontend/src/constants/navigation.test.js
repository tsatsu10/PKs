import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS } from './navigation';

describe('navigation config', () => {
  it('flattens groups and has unique paths', () => {
    expect(NAV_ITEMS.length).toBe(NAV_GROUPS.reduce((n, g) => n + g.items.length, 0));
    expect(new Set(NAV_ITEMS.map((i) => i.to)).size).toBe(NAV_ITEMS.length);
  });

  it('includes Trash and no longer includes About', () => {
    const paths = NAV_ITEMS.map((i) => i.to);
    expect(paths).toContain('/trash');
    expect(paths).not.toContain('/about');
  });

  it('gives every item a label, icon and search keywords', () => {
    NAV_ITEMS.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.keywords.length).toBeGreaterThan(0);
    });
  });
});
