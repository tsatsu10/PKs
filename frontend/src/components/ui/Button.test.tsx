import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Button, { ButtonLink } from './Button';

describe('Button', () => {
  it('defaults to type=button', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('is busy and disabled while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /Save/ });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.ui-spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards the ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);
    expect(ref.current).toBe(screen.getByRole('button'));
  });
});

describe('Button while loading', () => {
  it('keeps its name while loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('ButtonLink', () => {
  it('is a link that looks like a button', () => {
    render(<MemoryRouter><ButtonLink to="/objects/new" variant="primary" size="sm">New object</ButtonLink></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'New object' });
    expect(link).toHaveAttribute('href', '/objects/new');
    expect(link).toHaveClass('ui-button', 'ui-button--primary', 'ui-button--sm');
  });
});
