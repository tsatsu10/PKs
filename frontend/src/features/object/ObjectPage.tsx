import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { touchObjectView } from '../../lib/objectView';
import { usePrefetchObject } from '../../data/usePrefetchObject';
import { SkeletonDetail } from '../../components/Skeleton';
import { useObjectPage } from './useObjectPage';
import { useEditSession } from './hooks/useEditSession';
import { useObjectActions } from './hooks/useObjectActions';
import { useTaxonomyActions } from './hooks/useTaxonomyActions';
import { useLinks } from './hooks/useLinks';
import { useAttachments } from './hooks/useAttachments';
import { useShares } from './hooks/useShares';
import { useRunPrompt } from './hooks/useRunPrompt';
import { useObjectExport } from './hooks/useObjectExport';
import Header from './Header';
import LinkSearch from './LinkSearch';
import MetaLine from './MetaLine';
import ReadOnlyBody from './ReadOnlyBody';
import EditForm from './EditForm';
import { SynthesizeCta, RunPromptPanel } from './AiPanel';
import Taxonomy from './Taxonomy';
import Attachments from './Attachments';
import Links from './Links';
import History from './History';
import SharePanel from './SharePanel';
import ExportPanel from './ExportPanel';
import './ObjectPage.css';

/** The object page (`/objects/:id`). The route remounts it per id, so no state carries over. */
export default function ObjectPage() {
  const { id } = useParams();
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id ?? undefined;
  const page = useObjectPage({ id, userId });
  const {
    object, setObject, loading, error, setError, reload, draft, versions, objectDomains, setObjectDomains,
    objectTags, setObjectTags, allDomains, allTags, outgoingLinks, setOutgoingLinks, incomingLinks, setIncomingLinks,
    otherObjects, attachedFiles, setAttachedFiles, promptTemplates, promptRuns, setPromptRuns, suggestedTags,
    suggestedLinkedObjects, myShare, panelErrors, retryPanel,
  } = page;
  const prefetch = usePrefetchObject();
  const isOwner = !!object && object.user_id === userId;
  const canEdit = isOwner || myShare?.role === 'editor';

  const edit = useEditSession({ id, object, isOwner, draft, setObject, setError, userId });
  const actions = useObjectActions({ object, userId, objectDomains, objectTags, reload, setObject, setError });
  const taxonomy = useTaxonomyActions({ object, allDomains, allTags, setObjectDomains, setObjectTags, setError });
  const links = useLinks({ object, userId, otherObjects, outgoingLinks, incomingLinks, setOutgoingLinks, setIncomingLinks, setError });
  const attachments = useAttachments({ object, userId, setAttachedFiles, setError });
  const shares = useShares({ object, userId, setError });
  const run = useRunPrompt({ object, userId, promptTemplates, setPromptRuns, setError });
  const exportState = useObjectExport({ object, userId, objectDomains, objectTags, outgoingLinks, incomingLinks, setError });
  const [showSharePanel, setShowSharePanel] = useState(false);

  const objectId = object?.id;
  const ownerId = object?.user_id;
  useEffect(() => {
    if (!objectId || !userId || ownerId !== userId) return;
    touchObjectView(objectId);
  }, [objectId, ownerId, userId]);

  // Owner perf check (hand-off): measure from open to first visible content per object id.
  const visibleMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!objectId || visibleMarkedRef.current === objectId) return;
    visibleMarkedRef.current = objectId;
    performance.mark('pks:object-visible');
  }, [objectId]);

  if (loading) return <div className="object-detail loading"><p className="sr-only" role="status" aria-live="polite">Loading…</p><SkeletonDetail /></div>;
  if (error && !object) return <div className="object-detail"><p className="detail-error" role="alert">{error}</p><Link to="/">Back to Dashboard</Link></div>;
  if (!object) return null;

  const availableDomains = allDomains.filter((d) => !objectDomains.some((od) => od.id === d.id));
  const availableTags = allTags.filter((t) => !objectTags.some((ot) => ot.id === t.id));
  const availableToLink = otherObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id));
  const historyProps = {
    isOwner, versions, versionsError: panelErrors.versions, onRetryVersions: () => retryPanel('versions'),
    promptRuns, promptTemplates, runsError: panelErrors.runs ?? panelErrors.prompts,
    onRetryRuns: () => retryPanel(panelErrors.runs ? 'runs' : 'prompts'),
    restoreVersion: actions.restoreVersion, restoringVersion: actions.restoringVersion,
  };

  return (
    <div className="object-detail">
      <Header
        object={object}
        isOwner={isOwner}
        canEdit={canEdit}
        canLink={canEdit}
        linkSearch={<LinkSearch links={links} outgoingLinks={outgoingLinks} prefetch={prefetch} />}
        editing={edit.editing}
        saving={edit.saving}
        actions={actions}
        onToggleExport={() => exportState.setShow((v) => !v)}
        onToggleShare={() => { setShowSharePanel((v) => !v); if (!showSharePanel) shares.load(); }}
        onEdit={edit.start}
        onCancel={edit.cancel}
        onSave={edit.save}
      />
      {error && <div className="form-error" role="alert">{error}</div>}

      {showSharePanel && isOwner && <SharePanel shares={shares} onClose={() => setShowSharePanel(false)} />}
      {exportState.show && <ExportPanel exportState={exportState} />}

      <div className="detail-layout">
        <div className="detail-main" aria-label="Object content">
          <div className="detail-hero">
            <MetaLine object={object} />
            {edit.editing ? (
              <EditForm object={object} isOwner={isOwner} edit={edit} />
            ) : (
              <ReadOnlyBody object={object} synthesize={isOwner ? <SynthesizeCta run={run} /> : null} />
            )}
          </div>
        </div>
        <aside className="detail-sidebar">
          <Taxonomy
            isOwner={isOwner}
            objectDomains={objectDomains}
            objectTags={objectTags}
            availableDomains={availableDomains}
            availableTags={availableTags}
            suggestedTags={suggestedTags}
            panelErrors={panelErrors}
            retryPanel={retryPanel}
            actions={taxonomy}
          />
          <Attachments isOwner={isOwner} files={attachedFiles} error={panelErrors.files} onRetry={() => retryPanel('files')} attachments={attachments} />
          <History variant="owner" {...historyProps} />
          <Links
            isOwner={isOwner}
            canLink={isOwner}
            outgoing={outgoingLinks}
            incoming={incomingLinks}
            availableToLink={availableToLink}
            suggested={suggestedLinkedObjects}
            error={panelErrors.links}
            onRetry={() => retryPanel('links')}
            links={links}
            prefetch={prefetch}
          />
          <History variant="readonly" {...historyProps} />
        </aside>
      </div>

      {run.showRunPanel && <RunPromptPanel object={object} run={run} promptTemplates={promptTemplates} error={error} />}
    </div>
  );
}
