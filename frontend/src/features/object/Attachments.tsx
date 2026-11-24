import { Paperclip, X } from 'lucide-react';
import QueryError from '../../components/QueryError';
import Card from '../../components/ui/Card';
import IconButton from '../../components/ui/IconButton';
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
    <Card as="section" title="Attachments">
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
                  {isOwner && <IconButton label="Remove attachment" icon={X} iconSize={16} onClick={() => detach(f.id)} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="detail-empty">No attachments yet.</p>
          )}
          {isOwner && (
            <label className={`attachment-upload ${uploading ? 'is-uploading' : ''}`}>
              <input type="file" accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={attach} disabled={uploading} />
              <Paperclip size={16} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Attach file'}
            </label>
          )}
        </>
      )}
    </Card>
  );
}
