import { getErrorMessage } from '../lib/errors';
import './QueryError.css';

type Props = { error: unknown; onRetry?: () => void; what?: string };

/** Inline load error with Retry, so a failed fetch never looks like an empty list (R9, R10). */
export default function QueryError({ error, onRetry, what }: Props) {
  return (
    <div className="query-error" role="alert">
      <p className="query-error-message">
        {what ? `Couldn't load ${what}. ` : ''}{getErrorMessage(error)}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
