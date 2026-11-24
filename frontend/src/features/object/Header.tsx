import type { ReactNode } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { MOBILE_QUERY } from '../../breakpoints';
import { MoreHorizontal, Pin } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Popover from '../../components/ui/Popover';
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
  /** The object doesn't exist on the server yet (create pending or failed): nothing here can act on it. */
  inert?: boolean;
};

/**
 * Breadcrumbs, the link-search slot and the action buttons. Editing happens in place (no Edit/Save).
 * At 768px and below (the app's mobile layout) the actions sit behind one "More actions" button, so the header stays one row (M6).
 */
export default function Header({ object, isOwner, canEdit, canLink, linkSearch, actions, onToggleExport, onToggleShare, inert = false }: Props) {
  const { togglePin, pinning, duplicate, duplicating, remove, deleting, saveVersion, savingVersion } = actions;
  const narrow = useMediaQuery(MOBILE_QUERY, false, { getInitialValueInEffect: false });

  const buttons = (after: () => void = () => {}) => {
    const run = (fn: () => void) => () => { fn(); after(); };
    return (
      <>
        {isOwner && (
          <Button onClick={run(togglePin)} disabled={pinning} title={object.is_pinned ? 'Unpin from top' : 'Pin to top'}>
            <Pin size={16} aria-hidden="true" />
            {object.is_pinned ? 'Unpin' : 'Pin'}
          </Button>
        )}
        <Button onClick={run(onToggleExport)}>Export</Button>
        {isOwner && (
          <Button onClick={run(duplicate)} disabled={duplicating} title="Duplicate (copy domains and tags)">{duplicating ? 'Duplicating…' : 'Duplicate'}</Button>
        )}
        {isOwner && <Button onClick={run(onToggleShare)}>Share</Button>}
        {canEdit && (
          <Button onClick={run(saveVersion)} disabled={savingVersion} title="Keep the current text in version history">
            {savingVersion ? 'Saving version…' : 'Save version'}
          </Button>
        )}
        {isOwner && <Button variant="danger" onClick={run(remove)} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>}
      </>
    );
  };

  return (
    <header className={`object-detail-header${narrow ? '' : ' object-detail-header--sticky'}`} inert={inert}>
      <div className="object-detail-header-left">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: object.title || 'Object' }]} />
      </div>
      {canLink && linkSearch}
      {narrow ? (
        <Popover label="More actions" align="end" trigger={(p) => <IconButton label="More actions" icon={MoreHorizontal} variant="secondary" {...p} />}>
          {(close) => <div className="detail-actions detail-actions--menu">{buttons(close)}</div>}
        </Popover>
      ) : (
        <div className="detail-actions">{buttons()}</div>
      )}
    </header>
  );
}
