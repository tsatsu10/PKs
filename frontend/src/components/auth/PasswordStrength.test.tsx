import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import PasswordStrength from './PasswordStrength';
import { scorePassword } from '../../lib/passwordScore';

describe('scorePassword', () => {
  it('scores 0 for an empty password', () => {
    expect(scorePassword('')).toBe(0);
  });

  it('scores 1 for a short simple password', () => {
    expect(scorePassword('abcdefgh')).toBe(1);
  });

  it('rewards length, mixed case, digits and symbols', () => {
    expect(scorePassword('Abcdefgh1!')).toBe(4);
  });

  it('caps at 4', () => {
    expect(scorePassword('Abcdefghijklmnop1!')).toBe(4);
  });
});

describe('PasswordStrength', () => {
  it('renders nothing for an empty password', () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fills one segment and warns for a weak password', () => {
    const { container, getByText } = render(<PasswordStrength password="abcdefgh" />);
    expect(container.querySelectorAll('.auth-strength-segment.is-filled')).toHaveLength(1);
    expect(getByText('Weak')).toBeInTheDocument();
  });

  it('fills all four segments for a strong password', () => {
    const { container, getByText } = render(<PasswordStrength password="Abcdefgh1!" />);
    expect(container.querySelectorAll('.auth-strength-segment.is-filled')).toHaveLength(4);
    expect(getByText('Strong')).toBeInTheDocument();
  });

  it('marks the level for styling', () => {
    const { container } = render(<PasswordStrength password="Abcdefgh1!" />);
    expect(container.querySelector('.auth-strength')?.getAttribute('data-level')).toBe('4');
  });
});
