import { getErrorMessage } from '../lib/errors';
import './QueryError.css';
import Button from './ui/Button';

type Props = { error: unknown; onRetry?: () => void; what?: string };

/** Inline load error with Retry, so a failed fetch never looks like an empty list (R9, R10). */
export default function QueryError({ error, onRetry, what }: Props) {
  return (
    <div className="query-error" role="alert">
      <p className="query-error-message">
        {what ? `Couldn't load ${what}. ` : ''}{getErrorMessage(error)}
      </p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>Retry</Button>
      )}
    </div>
  );
}
