import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryError from './QueryError';

describe('QueryError', () => {
  it('shows a plain message and retries', () => {
    const onRetry = vi.fn();
    render(<QueryError error={{ code: 'PGRST000', message: 'connection refused' }} onRetry={onRetry} what="tags" />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load tags. Something went wrong on our side.");
    expect(screen.getByRole('alert')).not.toHaveTextContent('connection refused');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
