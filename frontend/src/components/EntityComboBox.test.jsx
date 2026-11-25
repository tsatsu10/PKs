import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EntityComboBox from './EntityComboBox';

const options = [{ id: 'd1', name: 'Work' }];

describe('EntityComboBox', () => {
  it('labels the select and reports a choice', () => {
    const onChange = vi.fn();
    render(<EntityComboBox label="Domain" value="" onChange={onChange} options={options} />);
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'd1' } });
    expect(onChange).toHaveBeenCalledWith('d1');
  });

  it('has no create entry inside the select; creating starts from a button (A6)', () => {
    render(<EntityComboBox label="Domain" value="" onChange={vi.fn()} options={options} onCreate={vi.fn()} createLabel="New domain" />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Any', 'Work']);
    expect(screen.queryByLabelText('New domain name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New domain' }));
    expect(screen.getByLabelText('New domain name')).toHaveFocus();
  });

  it('creates on Enter and selects the new item', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn(async (name) => ({ id: 'd9', name }));
    render(<EntityComboBox label="Domain" value="" onChange={onChange} options={options} onCreate={onCreate} createLabel="New domain" />);
    fireEvent.click(screen.getByRole('button', { name: 'New domain' }));
    const input = screen.getByLabelText('New domain name');
    fireEvent.change(input, { target: { value: 'Health' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('d9'));
    expect(onCreate).toHaveBeenCalledWith('Health');
    expect(screen.queryByLabelText('New domain name')).not.toBeInTheDocument();
  });

  it('shows why a create failed', async () => {
    const onCreate = vi.fn(async () => { throw new Error('Name taken'); });
    render(<EntityComboBox label="Domain" value="" onChange={vi.fn()} options={options} onCreate={onCreate} createLabel="New domain" />);
    fireEvent.click(screen.getByRole('button', { name: 'New domain' }));
    fireEvent.change(screen.getByLabelText('New domain name'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name taken');
  });
});
