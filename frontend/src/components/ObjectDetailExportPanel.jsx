/**
 * Export panel for ObjectDetail: format, template, include toggles, recent jobs, actions.
 */
export default function ObjectDetailExportPanel({
  exportFormat,
  setExportFormat,
  exportTemplate,
  setExportTemplate,
  exportInclude,
  setExportInclude,
  applyExportTemplate,
  onExport,
  onClose,
}) {
  return (
    <section className="export-panel">
      <h2>Export object</h2>
      <div className="export-options">
        <label>
          Format{' '}
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
            <option value="txt">TXT</option>
            <option value="md">Markdown</option>
            <option value="html">HTML</option>
            <option value="json">JSON</option>
            <option value="docx">DOCX</option>
            <option value="pdf">PDF (print)</option>
          </select>
        </label>
        <label>
          Template{' '}
          <select
            value={exportTemplate}
            onChange={(e) => {
              const v = e.target.value;
              setExportTemplate(v);
              applyExportTemplate(v);
            }}
          >
            <option value="raw">Raw (content only)</option>
            <option value="brief">Brief (summary + key points)</option>
            <option value="full">Full</option>
            <option value="stakeholder">Stakeholder (condensed)</option>
          </select>
        </label>
      </div>
      <div className="export-include">
        <span className="export-include-label">Include:</span>
        {['content', 'summary', 'key_points', 'tags', 'domains', 'links'].map((k) => (
          <label key={k} className="checkbox-label">
            <input
              type="checkbox"
              checked={exportInclude[k]}
              onChange={(e) => setExportInclude((prev) => ({ ...prev, [k]: e.target.checked }))}
            />
            {k.replace('_', ' ')}
          </label>
        ))}
      </div>
      <div className="export-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onExport}>
          Export
        </button>
      </div>
    </section>
  );
}
