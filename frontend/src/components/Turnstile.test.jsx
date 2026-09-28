import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Turnstile from './Turnstile';
import { loadTurnstile } from '../lib/turnstile';

vi.mock('../lib/turnstile', async (importActual) => {
  const actual = await importActual();
  return { ...actual, loadTurnstile: vi.fn(actual.loadTurnstile) };
});

const LOAD_ERROR = /The security check couldn't load\. Check your connection or allow challenges\.cloudflare\.com, then retry\./;

afterEach(() => { delete window.turnstile; vi.mocked(loadTurnstile).mockClear(); });

describe('Turnstile', () => {
  it('renders nothing without a site key (dev)', () => {
    const { container } = render(<Turnstile siteKey="" onToken={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the widget and forwards tokens, expiry and errors', async () => {
    let options;
    window.turnstile = { render: vi.fn((el, opts) => { options = opts; return 'w1'; }), remove: vi.fn() };
    const onToken = vi.fn();
    const { unmount } = render(<Turnstile siteKey="1x00000000000000000000AA" onToken={onToken} />);
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled());
    expect(options.sitekey).toBe('1x00000000000000000000AA');
    options.callback('tok');
    options['expired-callback']();
    options['error-callback']();
    expect(onToken.mock.calls).toEqual([['tok'], [''], ['']]);
    unmount();
    expect(window.turnstile.remove).toHaveBeenCalledWith('w1');
  });

  it('shows a retryable message when the script fails to load', async () => {
    const onToken = vi.fn();
    vi.mocked(loadTurnstile).mockRejectedValueOnce(new Error('blocked'));
    render(<Turnstile siteKey="1x00000000000000000000AA" onToken={onToken} />);
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(onToken).toHaveBeenCalledWith('');

    // Retry re-attempts the load; this time the script is there and the widget renders.
    window.turnstile = { render: vi.fn(() => 'w2'), remove: vi.fn() };
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalledTimes(1));
    expect(loadTurnstile).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
  });

  it('shows the message on error-callback and Retry re-renders the widget', async () => {
    const calls = [];
    window.turnstile = {
      render: vi.fn((el, opts) => { calls.push(opts); return `w${calls.length}`; }),
      remove: vi.fn(),
    };
    const onToken = vi.fn();
    render(<Turnstile siteKey="1x00000000000000000000AA" onToken={onToken} />);
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();

    act(() => { calls[0]['error-callback'](); });
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(onToken).toHaveBeenLastCalledWith('');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalledTimes(2));
    expect(window.turnstile.remove).toHaveBeenCalledWith('w1');
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
    act(() => { calls[1].callback('tok2'); });
    expect(onToken).toHaveBeenLastCalledWith('tok2');
  });
});
