import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Combobox from './Combobox';

const fruit = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', hint: 'Yellow' },
  { value: 'c', label: 'Cherry' },
];

function renderCombobox(options = fruit) {
  const onSelect = vi.fn();
  render(<Combobox label="Add fruit" options={options} onSelect={onSelect} placeholder="Add fruit…" />);
  return { onSelect, input: screen.getByRole('combobox', { name: 'Add fruit' }) as HTMLInputElement };
}

describe('Combobox', () => {
  it('does not select while arrowing', () => {
    const { onSelect, input } = renderCombobox();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onSelect).not.toHaveBeenCalled();
    const banana = screen.getByRole('option', { name: /Banana/ });
    expect(input).toHaveAttribute('aria-activedescendant', banana.id);
    expect(banana).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('selects with Enter on the active option and clears', () => {
    const { onSelect, input } = renderCombobox();
    fireEvent.change(input, { target: { value: 'an' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['BananaYellow']);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects on option click', () => {
    const { onSelect, input } = renderCombobox();
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const cherry = screen.getByRole('option', { name: 'Cherry' });
    const mouseDown = fireEvent.mouseDown(cherry);
    fireEvent.click(cherry);
    expect(mouseDown).toBe(false); // default prevented, so the input keeps focus
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(input);
  });

  it('does not select on blur or Enter with the list closed', () => {
    const { onSelect, input } = renderCombobox();
    fireEvent.change(input, { target: { value: 'App' } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape, then clears on a second Escape', () => {
    const { input } = renderCombobox();
    fireEvent.change(input, { target: { value: 'App' } });
    const first = fireEvent.keyDown(input, { key: 'Escape' });
    expect(first).toBe(false); // handled, so an enclosing Dialog stays open
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input.value).toBe('App');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('ignores Enter and Escape while an IME is composing', () => {
    const { onSelect, input } = renderCombobox();
    fireEvent.change(input, { target: { value: 'ba' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the full list on click without selecting', () => {
    const { onSelect, input } = renderCombobox();
    fireEvent.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filters case-insensitively and caps results', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ value: String(i + 1), label: `Option ${i + 1}` }));
    const { input } = renderCombobox(many);
    fireEvent.change(input, { target: { value: 'OPTION' } });
    expect(screen.getAllByRole('option')).toHaveLength(50);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('announces the result count', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ value: String(i + 1), label: `Option ${i + 1}` }));
    const { input } = renderCombobox(many);
    fireEvent.change(input, { target: { value: 'option 1' } });
    expect(screen.getByText('11 results')).toHaveAttribute('aria-live', 'polite');
  });
});
