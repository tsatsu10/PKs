import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptionsInput from './OptionsInput';

describe('OptionsInput', () => {
  it('lets the user type commas and commits parsed options on blur', () => {
    const onCommit = vi.fn();
    render(<OptionsInput options={['Draft']} onCommit={onCommit} ariaLabel="Dropdown options" />);
    const input = screen.getByLabelText('Dropdown options');
    fireEvent.change(input, { target: { value: 'Draft, ' } });
    expect(input).toHaveValue('Draft, ');
    fireEvent.change(input, { target: { value: 'Draft, Done' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(['Draft', 'Done']);
  });
});
