import type { useObjectExport, ExportFormat } from './hooks/useObjectExport';
import type { ExportInclude } from './types';

const INCLUDE_KEYS: Array<keyof ExportInclude> = ['content', 'summary', 'key_points', 'tags', 'domains', 'links'];

/** Export panel: format, template, include toggles, actions. */
export default function ExportPanel({ exportState }: { exportState: ReturnType<typeof useObjectExport> }) {
  const { format, setFormat, template, setTemplate, include, setInclude, applyTemplate, run, setShow } = exportState;
  return (
    <section className="export-panel">
      <h2>Export object</h2>
      <div className="export-options">
        <label>
          Format{' '}
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
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
            value={template}
            onChange={(e) => {
              const v = e.target.value;
              setTemplate(v);
              applyTemplate(v);
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
        {INCLUDE_KEYS.map((k) => (
          <label key={k} className="checkbox-label">
            <input
              type="checkbox"
              checked={include[k]}
              onChange={(e) => setInclude((prev) => ({ ...prev, [k]: e.target.checked }))}
            />
            {k.replace('_', ' ')}
          </label>
        ))}
      </div>
      <div className="export-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => run()}>
          Export
        </button>
      </div>
    </section>
  );
}
