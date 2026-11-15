import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimezoneSuggestion from './TimezoneSuggestion';

const browserIs = (zone) =>
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: zone });

describe('TimezoneSuggestion', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("offers the browser's zone when it differs from the stored one", () => {
    browserIs('Europe/Berlin');
    const onUse = vi.fn();
    render(<TimezoneSuggestion stored="Africa/Accra" onUse={onUse} />);
    expect(screen.getByText(/Your browser says Europe\/Berlin\. Use it\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onUse).toHaveBeenCalledWith('Europe/Berlin');
  });

  it('shows nothing when the zones match', () => {
    browserIs('Europe/Berlin');
    const { container } = render(<TimezoneSuggestion stored="Europe/Berlin" onUse={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
