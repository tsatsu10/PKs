import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Tabs from './Tabs';

const tabs = [
  { id: 'notes', label: 'Notes', panel: <p>Notes body</p> },
  { id: 'links', label: 'Links', panel: <p>Links body</p> },
  { id: 'history', label: 'History', panel: <p>History body</p> },
];

describe('Tabs', () => {
  it('moves selection with arrows and wraps', () => {
    const onChange = vi.fn();
    render(<Tabs label="Object sections" tabs={tabs} onChange={onChange} />);
    expect(screen.getByRole('tablist', { name: 'Object sections' })).toBeInTheDocument();
    const notes = screen.getByRole('tab', { name: 'Notes' });
    expect(notes).toHaveAttribute('aria-selected', 'true');
    notes.focus();

    fireEvent.keyDown(notes, { key: 'ArrowLeft' });
    const history = screen.getByRole('tab', { name: 'History' });
    expect(history).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(history);
    expect(onChange).toHaveBeenLastCalledWith('history');
    expect(screen.getByRole('tabpanel', { name: 'History' })).toHaveTextContent('History body');

    fireEvent.keyDown(history, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Notes' }));
  });

  it('only the selected tab is tabbable', () => {
    render(<Tabs label="Object sections" tabs={tabs} value="links" />);
    expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel', { name: 'Links' });
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute('aria-controls', panel.id);
  });
});
