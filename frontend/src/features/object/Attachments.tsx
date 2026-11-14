import QueryError from '../../components/QueryError';
import type { useAttachments } from './hooks/useAttachments';
import type { FileRow } from './types';

type Props = {
  isOwner: boolean;
  files: FileRow[];
  error: unknown;
  onRetry: () => void;
  attachments: ReturnType<typeof useAttachments>;
};

/** The Attachments card: download for everyone; attach and remove for the owner. */
export default function Attachments({ isOwner, files, error, onRetry, attachments }: Props) {
  const { uploading, attach, download, detach } = attachments;
  return (
    <div className="detail-section-card">
      <h3 className="detail-section-card-title">Attachments</h3>
      {error ? (
        <QueryError what="attachments" error={error} onRetry={onRetry} />
      ) : files.length === 0 && !isOwner ? (
        <p className="detail-empty">No attachments.</p>
      ) : (
        <>
          {files.length > 0 ? (
            <ul className="attachments-list">
              {files.map((f) => (
                <li key={f.id}>
                  <button type="button" className="attachment-name" onClick={() => download(f)}>
                    {f.filename}
                  </button>
                  {f.size_bytes != null && <span className="attachment-size">({(f.size_bytes / 1024).toFixed(1)} KB)</span>}
                  {isOwner && <button type="button" className="chip-remove" onClick={() => detach(f.id)} aria-label="Remove attachment">×</button>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="detail-empty">No attachments yet.</p>
          )}
          {isOwner && (
            <label className={`attachment-upload ${uploading ? 'is-uploading' : ''}`}>
              <input type="file" accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={attach} disabled={uploading} />
              {uploading ? 'Uploading…' : '+ Attach file'}
            </label>
          )}
        </>
      )}
    </div>
  );
}
