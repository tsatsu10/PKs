import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Field from './Field';
import Input from './Input';

describe('Field', () => {
  it('labels its control', () => {
    render(<Field label="Name">{(ids) => <Input id={ids.id} />}</Field>);
    expect(screen.getByLabelText('Name').tagName).toBe('INPUT');
  });

  it('describes the control with hint and error', () => {
    render(
      <Field label="Name" hint="Your full name" error="Name is required">
        {(ids) => <Input id={ids.id} aria-describedby={ids.describedBy} invalid={ids.invalid} />}
      </Field>,
    );
    const input = screen.getByLabelText('Name');
    const hint = screen.getByText('Your full name');
    const error = screen.getByText('Name is required');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(error.id);
    expect(error).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('hides the label visually but keeps the name', () => {
    render(<Field label="Name" labelHidden>{(ids) => <Input id={ids.id} />}</Field>);
    expect(screen.getByText('Name')).toHaveClass('ui-visually-hidden');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });
});
