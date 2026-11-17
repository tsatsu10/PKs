import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from './PasswordInput';

function renderInput(props = {}) {
  return render(
    <form>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value="secret" onChange={() => {}} {...props} />
    </form>,
  );
}

const input = () => screen.getByLabelText('Password');

describe('PasswordInput', () => {
  it('starts hidden and shows the password on toggle', () => {
    renderInput();
    expect(input()).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input()).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input()).toHaveAttribute('type', 'password');
  });

  it('exposes the pressed state and keeps autocomplete', () => {
    renderInput({ autoComplete: 'new-password' });
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(input()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('keeps a hint or error description when provided', () => {
    renderInput({ describedBy: 'pw-error', invalid: true });
    expect(input()).toHaveAttribute('aria-describedby', 'pw-error');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });
});
