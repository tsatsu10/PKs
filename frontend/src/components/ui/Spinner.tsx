import './Spinner.css';

export interface SpinnerProps {
  size?: 'sm' | 'md';
  label?: string;
  /** Inside a control that already says it is busy: no status role, no text. */
  decorative?: boolean;
}

export default function Spinner({ size = 'md', label, decorative = false }: SpinnerProps) {
  if (decorative) {
    return (
      <span className={`ui-spinner ui-spinner--${size}`} aria-hidden="true">
        <span className="ui-spinner-ring" />
      </span>
    );
  }
  return (
    <span role="status" className={`ui-spinner ui-spinner--${size}`}>
      <span className="ui-spinner-ring" aria-hidden="true" />
      <span className="ui-visually-hidden">{label ?? 'Loading'}</span>
    </span>
  );
}
