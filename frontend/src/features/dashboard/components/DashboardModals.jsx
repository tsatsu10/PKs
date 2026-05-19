import EntityComboBox from '../../../components/EntityComboBox';
import { OBJECT_TYPES, OBJECT_STATUSES, formatObjectTypeLabel } from '../../../constants';

/**
 * Export and bulk-action modals for the dashboard.
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
  return (
    <>
      {showExportModal && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
          <div className="dashboard-modal">
            <h2 id="export-modal-title">
              {exportScope === 'filtered' ? 'Export filtered results' : `Export ${selectedIds.size} selected`}
            </h2>
            <p className="muted">Download as a ZIP with one file per object.</p>
            <label className="dashboard-export-scope">
              <span>Scope</span>
              <select value={exportScope} onChange={(e) => setExportScope(e.target.value)} aria-label="Export scope">
                <option value="selected">Selected ({selectedIds.size})</option>
                <option value="filtered">All matching current filters</option>
              </select>
            </label>
            <label>
              Format
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                <option value="txt">TXT</option>
                <option value="md">Markdown</option>
              </select>
            </label>
            <label>
              Template
              <select value={exportTemplate} onChange={(e) => setExportTemplate(e.target.value)}>
                <option value="raw">Raw (content only)</option>
                <option value="brief">Brief (summary + key points)</option>
                <option value="full">Full</option>
                <option value="stakeholder">Stakeholder</option>
              </select>
            </label>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)} disabled={exporting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleExportSelected} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'add_domain' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-add-domain-title">
          <div className="dashboard-modal">
            <h2 id="bulk-add-domain-title">Add domain to {selectedIds.size} object(s)</h2>
            <EntityComboBox
              label="Domain"
              value={bulkDomainId}
              onChange={setBulkDomainId}
              options={domains}
              onCreate={createDomainInline}
              placeholder="Select domain"
              createLabel="Create domain"
              disabled={bulkActionLoading}
            />
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkDomainId(''); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkAddDomain} disabled={bulkActionLoading || !bulkDomainId}>
                {bulkActionLoading ? 'Adding…' : 'Add domain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'add_tag' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-add-tag-title">
          <div className="dashboard-modal">
            <h2 id="bulk-add-tag-title">Add tag to {selectedIds.size} object(s)</h2>
            <EntityComboBox
              label="Tag"
              value={bulkTagId}
              onChange={setBulkTagId}
              options={tags}
              onCreate={createTagInline}
              placeholder="Select tag"
              createLabel="Create tag"
              disabled={bulkActionLoading}
            />
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkTagId(''); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkAddTag} disabled={bulkActionLoading || !bulkTagId}>
                {bulkActionLoading ? 'Adding…' : 'Add tag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'remove_domain' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-remove-domain-title">
          <div className="dashboard-modal">
            <h2 id="bulk-remove-domain-title">Remove domain from {selectedIds.size} object(s)</h2>
            <label>
              Domain
              <select value={bulkDomainId} onChange={(e) => setBulkDomainId(e.target.value)}>
                <option value="">Select domain</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkDomainId(''); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkRemoveDomain} disabled={bulkActionLoading || !bulkDomainId}>
                {bulkActionLoading ? 'Removing…' : 'Remove domain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'remove_tag' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-remove-tag-title">
          <div className="dashboard-modal">
            <h2 id="bulk-remove-tag-title">Remove tag from {selectedIds.size} object(s)</h2>
            <label>
              Tag
              <select value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
                <option value="">Select tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkTagId(''); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkRemoveTag} disabled={bulkActionLoading || !bulkTagId}>
                {bulkActionLoading ? 'Removing…' : 'Remove tag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'delete' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
          <div className="dashboard-modal">
            <h2 id="bulk-delete-title">Delete {selectedIds.size} object(s)?</h2>
            <p className="muted">Objects will be moved to trash (soft delete). This action cannot be undone from this screen.</p>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBulkModal(null)} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={bulkDelete} disabled={bulkActionLoading}>
                {bulkActionLoading ? 'Deleting…' : 'Delete selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'change_type' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-change-type-title">
          <div className="dashboard-modal">
            <h2 id="bulk-change-type-title">Change type for {selectedIds.size} object(s)</h2>
            <label className="dashboard-modal-label">
              Type
              <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                {OBJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{formatObjectTypeLabel(t)}</option>
                ))}
              </select>
            </label>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkType('note'); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkChangeType} disabled={bulkActionLoading}>
                {bulkActionLoading ? 'Updating…' : 'Change type'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'set_status' && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-set-status-title">
          <div className="dashboard-modal">
            <h2 id="bulk-set-status-title">Set status for {selectedIds.size} object(s)</h2>
            <label className="dashboard-modal-label">
              Status
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                {OBJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="dashboard-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkStatus('active'); }} disabled={bulkActionLoading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={bulkSetStatus} disabled={bulkActionLoading}>
                {bulkActionLoading ? 'Updating…' : 'Set status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

