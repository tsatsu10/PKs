import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckInbox from './CheckInbox';

function renderInbox(onResend = vi.fn().mockResolvedValue(undefined)) {
  return render(
    <MemoryRouter>
      <CheckInbox email="ana@example.com" onResend={onResend} />
    </MemoryRouter>,
  );
}

describe('CheckInbox', () => {
  afterEach(() => vi.useRealTimers());

  it('states what was sent and where', () => {
    renderInbox();
    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open mail app' })).toHaveAttribute(
      'href',
      'mailto:ana@example.com',
    );
    expect(screen.getByRole('link', { name: 'Change email' })).toHaveAttribute('href', '/register');
  });

  it('rate-limits the resend with a countdown', () => {
    vi.useFakeTimers();
    renderInbox();
    const resend = screen.getByRole('button', { name: /Resend link/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent('Resend link (in 60 s)');
    act(() => vi.advanceTimersByTime(60_000));
    expect(resend).toHaveTextContent('Resend link');
    expect(resend).toBeEnabled();
  });

  it('resends and restarts the countdown on success', async () => {
    vi.useFakeTimers();
    const onResend = vi.fn().mockResolvedValue(undefined);
    renderInbox(onResend);
    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Resend link \(in/ })).toBeDisabled();
  });

  it('shows the error and keeps the button enabled when resend fails', async () => {
    vi.useFakeTimers();
    const onResend = vi.fn().mockResolvedValue({ error: 'Too many requests' });
    renderInbox(onResend);
    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeEnabled();
  });
});
