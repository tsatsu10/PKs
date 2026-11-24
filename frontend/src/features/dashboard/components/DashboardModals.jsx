import EntityComboBox from '../../../components/EntityComboBox';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Dialog from '../../../components/ui/Dialog';
import Field from '../../../components/ui/Field';
import Select from '../../../components/ui/Select';
import { OBJECT_TYPES, OBJECT_STATUSES, formatObjectTypeLabel } from '../../../constants';

const plural = (n) => `${n} object${n === 1 ? '' : 's'}`;

/** One bulk-action dialog: a single control, Cancel and the action. */
function BulkDialog({ title, onCancel, onConfirm, confirmLabel, busyLabel, busy, disabled, children }) {
  return (
    <Dialog
      open
      size="sm"
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy || disabled}>{busy ? busyLabel : confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/**
 * Export and bulk-action dialogs for the dashboard.
 */
export default function DashboardModals({
  showExportModal,
  setShowExportModal,
  exportScope,
  setExportScope,
  exportFormat,
  setExportFormat,
  exportTemplate,
  setExportTemplate,
  exporting,
  handleExportSelected,
  selectedIds,
  bulkModal,
  setBulkModal,
  bulkDomainId,
  setBulkDomainId,
  bulkTagId,
  setBulkTagId,
  bulkType,
  setBulkType,
  bulkStatus,
  setBulkStatus,
  bulkActionLoading,
  domains,
  tags,
  createDomainInline,
  createTagInline,
  bulkAddDomain,
  bulkAddTag,
  bulkRemoveDomain,
  bulkRemoveTag,
  bulkDelete,
  bulkChangeType,
  bulkSetStatus,
}) {
  const count = selectedIds.size;
  const busy = bulkActionLoading;
  const closeDomain = () => { setBulkModal(null); setBulkDomainId(''); };
  const closeTag = () => { setBulkModal(null); setBulkTagId(''); };

  return (
    <>
      <Dialog
        open={showExportModal}
        size="sm"
        title={exportScope === 'filtered' ? 'Export filtered results' : `Export ${count} selected`}
        description="Download as a ZIP with one file per object."
        onClose={() => setShowExportModal(false)}
        footer={
          <>
            <Button onClick={() => setShowExportModal(false)} disabled={exporting}>Cancel</Button>
            <Button variant="primary" onClick={handleExportSelected} disabled={exporting}>{exporting ? 'Exporting…' : 'Export ZIP'}</Button>
          </>
        }
      >
        <div className="dashboard-modal-fields">
          <Field label="Scope">
            {(f) => (
              <Select id={f.id} value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
                <option value="selected">Selected ({count})</option>
                <option value="filtered">All matching current filters</option>
              </Select>
            )}
          </Field>
          <Field label="Format">
            {(f) => (
              <Select id={f.id} value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                <option value="txt">TXT</option>
                <option value="md">Markdown</option>
              </Select>
            )}
          </Field>
          <Field label="Template">
            {(f) => (
              <Select id={f.id} value={exportTemplate} onChange={(e) => setExportTemplate(e.target.value)}>
                <option value="raw">Raw (content only)</option>
                <option value="brief">Brief (summary + key points)</option>
                <option value="full">Full</option>
                <option value="stakeholder">Stakeholder</option>
              </Select>
            )}
          </Field>
        </div>
      </Dialog>

      {bulkModal === 'add_domain' && (
        <BulkDialog title={`Add domain to ${plural(count)}`} onCancel={closeDomain} onConfirm={bulkAddDomain} confirmLabel="Add domain" busyLabel="Adding…" busy={busy} disabled={!bulkDomainId}>
          <EntityComboBox label="Domain" value={bulkDomainId} onChange={setBulkDomainId} options={domains} onCreate={createDomainInline} placeholder="Select domain" createLabel="Create domain" disabled={busy} />
        </BulkDialog>
      )}

      {bulkModal === 'add_tag' && (
        <BulkDialog title={`Add tag to ${plural(count)}`} onCancel={closeTag} onConfirm={bulkAddTag} confirmLabel="Add tag" busyLabel="Adding…" busy={busy} disabled={!bulkTagId}>
          <EntityComboBox label="Tag" value={bulkTagId} onChange={setBulkTagId} options={tags} onCreate={createTagInline} placeholder="Select tag" createLabel="Create tag" disabled={busy} />
        </BulkDialog>
      )}

      {bulkModal === 'remove_domain' && (
        <BulkDialog title={`Remove domain from ${plural(count)}`} onCancel={closeDomain} onConfirm={bulkRemoveDomain} confirmLabel="Remove domain" busyLabel="Removing…" busy={busy} disabled={!bulkDomainId}>
          <Field label="Domain">
            {(f) => (
              <Select id={f.id} value={bulkDomainId} onChange={(e) => setBulkDomainId(e.target.value)}>
                <option value="">Select domain</option>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </Field>
        </BulkDialog>
      )}

      {bulkModal === 'remove_tag' && (
        <BulkDialog title={`Remove tag from ${plural(count)}`} onCancel={closeTag} onConfirm={bulkRemoveTag} confirmLabel="Remove tag" busyLabel="Removing…" busy={busy} disabled={!bulkTagId}>
          <Field label="Tag">
            {(f) => (
              <Select id={f.id} value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
                <option value="">Select tag</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
        </BulkDialog>
      )}

      <ConfirmDialog
        open={bulkModal === 'delete'}
        danger
        title={`Move ${plural(count)} to Trash?`}
        message={`You can restore ${count === 1 ? 'it' : 'them'} from Trash later.`}
        confirmLabel={busy ? 'Moving…' : 'Move to Trash'}
        busy={busy}
        onConfirm={bulkDelete}
        onCancel={() => setBulkModal(null)}
      />

      {bulkModal === 'change_type' && (
        <BulkDialog title={`Change type for ${plural(count)}`} onCancel={() => { setBulkModal(null); setBulkType('note'); }} onConfirm={bulkChangeType} confirmLabel="Change type" busyLabel="Updating…" busy={busy}>
          <Field label="Type">
            {(f) => (
              <Select id={f.id} value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                {OBJECT_TYPES.map((t) => <option key={t} value={t}>{formatObjectTypeLabel(t)}</option>)}
              </Select>
            )}
          </Field>
        </BulkDialog>
      )}

      {bulkModal === 'set_status' && (
        <BulkDialog title={`Set status for ${plural(count)}`} onCancel={() => { setBulkModal(null); setBulkStatus('active'); }} onConfirm={bulkSetStatus} confirmLabel="Set status" busyLabel="Updating…" busy={busy}>
          <Field label="Status">
            {(f) => (
              <Select id={f.id} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                {OBJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </Field>
        </BulkDialog>
      )}
    </>
  );
}
