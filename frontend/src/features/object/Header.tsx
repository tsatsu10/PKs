import type { ReactNode } from 'react';
import Breadcrumbs from '../../components/Breadcrumbs';
import type { useObjectActions } from './hooks/useObjectActions';
import type { ObjectRow } from './types';

type Props = {
  object: ObjectRow;
  isOwner: boolean;
  canEdit: boolean;
  /** Shows the link-search slot. */
  canLink: boolean;
  linkSearch: ReactNode;
  editing: boolean;
  saving: boolean;
  actions: ReturnType<typeof useObjectActions>;
  onToggleExport: () => void;
  onToggleShare: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
};

/** Breadcrumbs, the link-search slot and the action buttons. */
export default function Header({ object, isOwner, canEdit, canLink, linkSearch, editing, saving, actions, onToggleExport, onToggleShare, onEdit, onCancel, onSave }: Props) {
  const { togglePin, pinning, duplicate, duplicating, remove, deleting } = actions;
  return (
    <header className="object-detail-header">
      <div className="object-detail-header-left">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: object.title || 'Object' }]} />
      </div>
      {canLink && linkSearch}
      <div className="detail-actions">
        {isOwner && (
          <button type="button" className={`btn btn-secondary ${object.is_pinned ? 'active' : ''}`} onClick={togglePin} disabled={pinning} title={object.is_pinned ? 'Unpin from top' : 'Pin to top'} aria-label={object.is_pinned ? 'Unpin' : 'Pin'}>
            {object.is_pinned ? '📌 Unpin' : 'Pin'}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onToggleExport}>Export</button>
        {isOwner && (
          <button type="button" className="btn btn-secondary" onClick={duplicate} disabled={duplicating} title="Duplicate (copy domains and tags)">{duplicating ? 'Duplicating…' : 'Duplicate'}</button>
        )}
        {isOwner && (
          <button type="button" className="btn btn-secondary" onClick={onToggleShare}>Share</button>
        )}
        {!editing ? (
          <>
            {canEdit && <button type="button" className="btn btn-secondary" onClick={onEdit}>Edit</button>}
            {isOwner && <button type="button" className="btn btn-danger" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        )}
      </div>
    </header>
  );
}
