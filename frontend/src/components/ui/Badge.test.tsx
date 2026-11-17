import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import Badge from './Badge';

describe('Badge', () => {
  it('renders badge text', () => {
    render(<Badge tone="ai" icon={Sparkles}>AI</Badge>);
    const badge = screen.getByText('AI').closest('.ui-badge');
    expect(badge).toHaveClass('ui-badge--ai');
    expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
