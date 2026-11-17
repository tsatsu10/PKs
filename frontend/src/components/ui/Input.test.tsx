import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import Input from './Input';
import Select from './Select';

describe('Input', () => {
  it('marks invalid', () => {
    render(<Input aria-label="Email" invalid />);
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards the ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="Email" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('textbox'));
  });
});

describe('Select', () => {
  it('marks invalid and forwards the ref', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select aria-label="Type" invalid ref={ref}>
        <option value="a">A</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Type' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(ref.current).toBe(select);
  });
});
