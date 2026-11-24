import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders the empty state action', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No objects yet"
        description="Create your first one."
        action={<button type="button">New object</button>}
      />,
    );
    expect(screen.getByText('No objects yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'New object' })).toBeInTheDocument();
  });
});
