import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { altKey, modKey } from '../../lib/keyboardMap';
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

describe('Kbd alt', () => {
  it('maps alt per platform', () => {
    stubMatchMedia(() => false);
    render(<Kbd keys={['alt', '1']} />);
    expect(screen.getByText(altKey)).toBeInTheDocument();
    expect(['⌥', 'Alt']).toContain(altKey);
    expect(screen.queryByText('alt')).not.toBeInTheDocument();
  });
});
