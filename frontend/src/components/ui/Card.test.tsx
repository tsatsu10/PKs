import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from './Card';

describe('Card', () => {
  it('labels a titled section by its heading', () => {
    render(<Card as="section" title="Domains">body</Card>);
    expect(screen.getByRole('region', { name: 'Domains' })).toBeInTheDocument();
  });

  it('renders the heading level asked for', () => {
    const { rerender } = render(<Card title="Domains">body</Card>);
    expect(screen.getByRole('heading', { level: 3, name: 'Domains' })).toBeInTheDocument();
    rerender(<Card title="Domains" titleLevel={2}>body</Card>);
    expect(screen.getByRole('heading', { level: 2, name: 'Domains' })).toBeInTheDocument();
  });
});
