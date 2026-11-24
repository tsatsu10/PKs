import './Spinner.css';

export interface SpinnerProps {
  size?: 'sm' | 'md';
  label?: string;
}

export default function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <span role="status" className={`ui-spinner ui-spinner--${size}`}>
      <span className="ui-spinner-ring" aria-hidden="true" />
      <span className="ui-visually-hidden">{label ?? 'Loading'}</span>
    </span>
  );
}
