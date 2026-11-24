import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { X } from 'lucide-react';
import IconButton from './IconButton';

describe('IconButton', () => {
  it('is named by its label', () => {
    render(<IconButton label="Close" icon={X} />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
