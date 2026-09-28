import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Turnstile from './Turnstile';

afterEach(() => { delete window.turnstile; });

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
});
