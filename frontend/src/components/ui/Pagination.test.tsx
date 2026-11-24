import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from './Pagination';

describe('Pagination', () => {
  it('marks the current page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={10} onPageChange={onPageChange} label="Objects pages" />);
    expect(screen.getByRole('navigation', { name: 'Objects pages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 4' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'Page 6' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
  });

  it('disables Previous on the first page', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} label="Pages" />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={() => {}} label="Pages" />);
    expect(container).toBeEmptyDOMElement();
  });
});
