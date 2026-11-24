import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './Page';

describe('Page', () => {
  it('renders one h1 with the title', () => {
    render(<Page title="Templates"><p>Body</p></Page>);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Templates');
    expect(headings[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('keeps a hidden title in the accessibility tree', () => {
    render(<Page title="Dashboard" titleHidden />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Dashboard' });
    expect(h1).toHaveClass('ui-visually-hidden');
  });

  it('renders actions beside the title', () => {
    render(<Page title="Templates" actions={<button type="button">New template</button>} />);
    const header = screen.getByRole('heading', { level: 1 }).parentElement!;
    expect(header).toContainElement(screen.getByRole('button', { name: 'New template' }));
  });

  it('applies the width asked for', () => {
    const { container } = render(<Page title="Search" width="narrow" />);
    expect(container.firstElementChild).toHaveClass('ui-page', 'ui-page--narrow');
  });
});
