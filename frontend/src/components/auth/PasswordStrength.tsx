import { scorePassword } from '../../lib/passwordScore';

const LEVELS = [
  { label: 'Too weak', hint: 'Use at least 8 characters.' },
  { label: 'Weak', hint: 'Add upper and lower case letters.' },
  { label: 'Fair', hint: 'Add a number or symbol to make it stronger.' },
  { label: 'Good', hint: 'Almost there — a longer password is stronger.' },
  { label: 'Strong', hint: null },
];

/** Four-segment strength meter with a text label and hint (design: register / reset). */
export default function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;
  const { label, hint } = LEVELS[score];
  return (
    <div className="auth-strength" data-level={score}>
      <div className="auth-strength-bar" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`auth-strength-segment${i < score ? ' is-filled' : ''}`} />
        ))}
      </div>
      <p className="auth-strength-label" id="auth-strength-label">
        {label}
        {hint && <span className="auth-strength-hint"> · {hint}</span>}
      </p>
    </div>
  );
}
