import QueryError from '../../components/QueryError';
import type { VersionRow, PromptRun, PromptTemplate } from './types';

type Props = {
  /**
   * 'owner': the restorable version list and the Prompt runs card (owner only).
   * 'readonly': the last-10 version list, shown when the owner card isn't (non-owners, or no versions yet).
   */
  variant: 'owner' | 'readonly';
  isOwner: boolean;
  versions: VersionRow[];
  versionsError: unknown;
  onRetryVersions: () => void;
  promptRuns: PromptRun[];
  promptTemplates: PromptTemplate[];
  runsError: unknown;
  onRetryRuns: () => void;
  restoreVersion: (v: VersionRow) => unknown;
  restoringVersion: string | null;
};

export default function History(props: Props) {
  return props.variant === 'owner' ? <OwnerHistory {...props} /> : <ReadonlyHistory {...props} />;
}

function OwnerHistory({ isOwner, versions, versionsError, onRetryVersions, promptRuns, promptTemplates, runsError, onRetryRuns, restoreVersion, restoringVersion }: Props) {
  if (!isOwner) return null;
  return (
    <>
      {(versions.length > 0 || versionsError) && (
        <div className="detail-section-card">
          <h3 className="detail-section-card-title">Version history</h3>
          {versionsError ? (
            <QueryError what="version history" error={versionsError} onRetry={onRetryVersions} />
          ) : (
            <ul className="version-history-list">
              {versions.map((v) => (
                <li key={v.id}>
                  <span className="version-history-meta">v{v.version} · {new Date(v.created_at).toLocaleString()}</span>
                  <span className="version-history-title">{v.title || 'Untitled'}</span>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => restoreVersion(v)} disabled={restoringVersion === v.id}>{restoringVersion === v.id ? 'Restoring…' : 'Restore'}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="detail-section-card">
        <h3 className="detail-section-card-title">Prompt runs</h3>
        {runsError ? (
          <QueryError what="prompt runs" error={runsError} onRetry={onRetryRuns} />
        ) : (
          <>
            <h4 className="detail-section-card-sub">History</h4>
            <ul className="prompt-runs-list">
              {promptRuns.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <span className="run-template-name">{r.prompt_template_id ? (promptTemplates.find((t) => t.id === r.prompt_template_id)?.name ?? 'Prompt') : 'Custom'}</span>
                  <span className="run-date">{new Date(r.created_at).toLocaleDateString()}</span>
                </li>
              ))}
              {promptRuns.length === 0 && <li className="muted">No runs yet.</li>}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function ReadonlyHistory({ isOwner, versions, versionsError, onRetryVersions }: Props) {
  if (isOwner && versions.length > 0) return null;
  return (
    <div className="detail-section-card">
      <h3 className="detail-section-card-title">Version history</h3>
      {versionsError ? (
        <QueryError what="version history" error={versionsError} onRetry={onRetryVersions} />
      ) : versions.length === 0 ? (
        <p className="detail-empty">No previous versions yet.</p>
      ) : (
        <ul className="version-list">
          {versions.slice(0, 10).map((v) => (
            <li key={v.id}>
              <span className="version-num">v{v.version}</span>
              <span className="version-title">{v.title}</span>
              <span className="version-date">{new Date(v.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
