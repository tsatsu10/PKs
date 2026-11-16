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
    render(<TimezoneSuggestion stored="Africa/Accra" value="Africa/Accra" onUse={onUse} />);
    expect(screen.getByText(/Your browser says Europe\/Berlin\. Use it\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onUse).toHaveBeenCalledWith('Europe/Berlin');
  });

  it('shows nothing when the stored zone matches the browser', () => {
    browserIs('Europe/Berlin');
    const { container } = render(<TimezoneSuggestion stored="Europe/Berlin" value="Europe/Berlin" onUse={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides once the field already holds the browser zone (stored zone set)', () => {
    browserIs('Europe/Berlin');
    const { container } = render(<TimezoneSuggestion stored="Africa/Accra" value="Europe/Berlin" onUse={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([null, undefined, ''])('tells the user to save when nothing is stored (%s) and the field is pre-filled', (stored) => {
    browserIs('Europe/Berlin');
    render(<TimezoneSuggestion stored={stored} value="Europe/Berlin" onUse={vi.fn()} />);
    expect(screen.getByText(/No timezone is saved yet.*UTC.*Save your profile to use Europe\/Berlin\./)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the browser zone when nothing is stored and the field holds something else', () => {
    browserIs('Europe/Berlin');
    const onUse = vi.fn();
    render(<TimezoneSuggestion stored={null} value="Asia/Tokyo" onUse={onUse} />);
    expect(screen.getByText(/No timezone is saved yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onUse).toHaveBeenCalledWith('Europe/Berlin');
  });
});
