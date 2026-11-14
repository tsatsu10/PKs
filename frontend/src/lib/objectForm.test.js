import { describe, it, expect } from 'vitest';
import { slugForTitle } from './objectForm';

const id = 'abcdef12-0000-0000-0000-000000000000';

describe('slugForTitle', () => {
  it('slugifies the trimmed title and appends the id prefix', () => {
    expect(slugForTitle('  Q4 Plan  ', id)).toBe('q4-plan-abcdef12');
  });

  it('gives null when the title has nothing to slugify', () => {
    expect(slugForTitle('!!!', id)).toBeNull();
    expect(slugForTitle('', id)).toBeNull();
  });
});
