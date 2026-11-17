import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { modKey } from '../../lib/keyboardMap';
import { stubMatchMedia } from '../../test/matchMedia';
import Kbd from './Kbd';

afterEach(() => { vi.restoreAllMocks(); });

describe('Kbd', () => {
  it('shows the platform modifier', () => {
    stubMatchMedia(() => false);
    render(<Kbd keys={['mod', 'K']} />);
    expect(screen.getByText(modKey)).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders nothing on touch', () => {
    stubMatchMedia((q) => q.includes('pointer: coarse'));
    const { container } = render(<Kbd keys={['mod', 'K']} />);
    expect(container).toBeEmptyDOMElement();
  });
});
