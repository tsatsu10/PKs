import type { ReactNode } from 'react';
import Breadcrumbs from '../../components/Breadcrumbs';
import type { useObjectActions } from './hooks/useObjectActions';
import type { ObjectRow } from './types';

type Props = {
  object: ObjectRow;
  isOwner: boolean;
  canEdit: boolean;
  /** Shows the link-search slot (anyone who can edit; useLinks offers only the user's own objects, B13). */
  canLink: boolean;
  linkSearch: ReactNode;
  actions: ReturnType<typeof useObjectActions>;
  onToggleExport: () => void;
  onToggleShare: () => void;
};

/** Breadcrumbs, the link-search slot and the action buttons. Editing happens in place (no Edit/Save). */
export default function Header({ object, isOwner, canEdit, canLink, linkSearch, actions, onToggleExport, onToggleShare }: Props) {
  const { togglePin, pinning, duplicate, duplicating, remove, deleting, saveVersion, savingVersion } = actions;
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
        {canEdit && (
          <button type="button" className="btn btn-secondary" onClick={saveVersion} disabled={savingVersion} title="Keep the current text in version history">
            {savingVersion ? 'Saving version…' : 'Save version'}
          </button>
        )}
        {isOwner && <button type="button" className="btn btn-danger" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
      </div>
    </header>
  );
}
