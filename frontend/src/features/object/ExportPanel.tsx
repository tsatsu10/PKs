import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Field from '../../components/ui/Field';
import Select from '../../components/ui/Select';
import type { useObjectExport, ExportFormat } from './hooks/useObjectExport';
import type { ExportInclude } from './types';

const INCLUDE_KEYS: Array<keyof ExportInclude> = ['content', 'summary', 'key_points', 'tags', 'domains', 'links'];

/** Export panel: format, template, include toggles, actions. */
export default function ExportPanel({ exportState }: { exportState: ReturnType<typeof useObjectExport> }) {
  const { format, setFormat, template, setTemplate, include, setInclude, applyTemplate, run, setShow } = exportState;
  return (
    <Card as="section" title="Export object" titleLevel={2} className="detail-panel">
      <div className="detail-panel-form">
        <Field label="Format">
          {(f) => (
            <Select id={f.id} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
              <option value="json">JSON</option>
              <option value="docx">DOCX</option>
              <option value="pdf">PDF (print)</option>
            </Select>
          )}
        </Field>
        <Field label="Template">
          {(f) => (
            <Select
              id={f.id}
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
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="export-include">
        <legend>Include</legend>
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
      </fieldset>
      <div className="detail-panel-actions">
        <Button onClick={() => setShow(false)}>Cancel</Button>
        <Button variant="primary" onClick={() => run()}>Export</Button>
      </div>
    </Card>
  );
}
