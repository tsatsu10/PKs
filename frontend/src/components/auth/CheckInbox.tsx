import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/** Small mail icon (design: a letter in a gradient circle). Inline SVG, no icon dependency. */
function MailIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

const RESEND_DELAY_S = 60;

/**
 * Post-sign-up confirmation card (design frame "Check your inbox"): states what was
 * sent where, opens the user's mail app, and offers a rate-limited resend.
 */
export default function CheckInbox({
  email,
  onResend,
  busy = false,
  changeEmailTo = '/register',
}: {
  email: string;
  onResend: () => Promise<{ error?: string } | void>;
  busy?: boolean;
  changeEmailTo?: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_S);
  const [resendError, setResendError] = useState('');

  const counting = secondsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [counting]);

  async function resend() {
    setResendError('');
    const result = await onResend();
    if (result?.error) setResendError(result.error);
    else setSecondsLeft(RESEND_DELAY_S);
  }

  return (
    <div className="auth-inbox">
      <div className="auth-inbox-icon">
        <MailIcon />
      </div>
      <h2 className="auth-inbox-title">Check your inbox</h2>
      <p className="auth-inbox-text">
        We sent a confirmation link to <strong>{email}</strong>. Open it to finish signing up.
      </p>
      <a className="auth-button auth-button-primary" href={`mailto:${email}`}>
        Open mail app
      </a>
      <button
        type="button"
        className="auth-button auth-button-secondary"
        disabled={secondsLeft > 0 || busy}
        onClick={resend}
      >
        {secondsLeft > 0 ? `Resend link (in ${secondsLeft} s)` : busy ? 'Sending…' : 'Resend link'}
      </button>
      {resendError && (
        <p className="auth-field-error" role="alert">
          {resendError}
        </p>
      )}
      <p className="auth-inbox-wrong">
        Wrong address? <Link to={changeEmailTo}>Change email</Link>
      </p>
      <p className="auth-inbox-note">Shares sent to this email will appear once you confirm.</p>
    </div>
  );
}
