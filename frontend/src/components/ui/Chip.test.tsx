import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Chip from './Chip';

describe('Chip', () => {
  it('names the remove button after the chip', () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>Research</Chip>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Research' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('uses the remove label given', () => {
    render(<Chip onRemove={() => {}} removeLabel="Remove tag Research">Research</Chip>);
    expect(screen.getByRole('button', { name: 'Remove tag Research' })).toBeInTheDocument();
  });

  it('has no button without onRemove', () => {
    render(<Chip>Research</Chip>);
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links when given href', () => {
    render(<MemoryRouter><Chip href="/?tag=1">Research</Chip></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '/?tag=1');
  });
});
