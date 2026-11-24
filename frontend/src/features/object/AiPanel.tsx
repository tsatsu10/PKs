import { useEffect } from 'react';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Dialog from '../../components/ui/Dialog';
import Field from '../../components/ui/Field';
import Select from '../../components/ui/Select';
import { AI_PROVIDERS, aiProviderLabel } from '../../constants';
import { resolveRunSelection, modelsForProvider, modelForProvider, serverSelection, isServerSelection } from '../../lib/aiProviders';
import type { useRunPrompt } from './hooks/useRunPrompt';
import type { ObjectRow, PromptTemplate } from './types';

type Run = ReturnType<typeof useRunPrompt>;

/** The owner's "Synthesize" call to action in the read view: pick a template, open the run panel. */
export function SynthesizeCta({ run }: { run: Run }) {
  return (
    <div className="detail-synthesize-cta">
      <span className="detail-synthesize-label">Synthesize</span>
      {run.applicableTemplates.length > 0 && (
        <select value={run.runTemplateId} onChange={(e) => run.setRunTemplateId(e.target.value)} className="detail-synthesize-select">
          <option value="">Select prompt template</option>
          {run.applicableTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      <Button variant="primary" onClick={run.openRunPanel}>Run prompt</Button>
    </div>
  );
}

type PanelProps = { object: ObjectRow; run: Run; promptTemplates: PromptTemplate[]; error: string };

/**
 * Run prompt dialog (A5): source, template, prompt, provider (default or user's API), model, context, generate, output.
 */
export function RunPromptPanel({ object, run, promptTemplates, error }: PanelProps) {
  const {
    runPromptSource, setRunPromptSource, runTemplateId, setRunTemplateId, runPromptText, setRunPromptText,
    runPromptEditFromBank, setRunPromptEditFromBank, aiProviders, runAiProviderId, setRunAiProviderId,
    runAiModel, setRunAiModel, applicableTemplates, runContextOpen, setRunContextOpen, generatingAI,
    runOutput, setRunOutput, savingRun, onGenerateWithAI, onSaveRun, onSaveOutputAsObject,
    requestCloseRunPanel, confirmDiscard, discardAndClose, keepEditing,
  } = run;
  const requestClose = () => requestCloseRunPanel();
  const { provider } = resolveRunSelection(runAiProviderId, aiProviders);
  const usingServerKey = isServerSelection(runAiProviderId);
  const allowedModels = modelsForProvider(provider, usingServerKey) as Array<{ id: string; label: string }>;
  const effectiveModel = modelForProvider(provider, runAiModel, usingServerKey) as string;

  useEffect(() => {
    if (effectiveModel && effectiveModel !== runAiModel) setRunAiModel(effectiveModel);
  }, [effectiveModel, runAiModel, setRunAiModel]);

  const syncTemplateText = () => {
    if (runTemplateId) {
      const t = promptTemplates.find((x) => x.id === runTemplateId);
      if (t?.prompt_text != null) setRunPromptText(t.prompt_text);
    }
    setRunPromptEditFromBank(false);
  };

  const objectTitle = object?.title?.trim() || 'Untitled';
  const objectType = object?.type || 'note';

  const handleProviderChange = (selection: string) => {
    const next = selection === '' ? null : selection;
    setRunAiProviderId(next);
    const nextProvider = resolveRunSelection(next, aiProviders).provider;
    setRunAiModel(modelForProvider(nextProvider, runAiModel, isServerSelection(next)));
  };

  return (
    <Dialog
      open
      size="lg"
      title="Run prompt on this object"
      description={`Running against: ${objectTitle}`}
      onClose={requestClose}
      className="run-prompt-dialog"
      footer={
        <>
          <Button onClick={requestClose}>Cancel</Button>
          <Button onClick={onSaveRun} disabled={savingRun}>Save run only</Button>
          <Button variant="primary" onClick={onSaveOutputAsObject} disabled={savingRun || !runOutput.trim()}>
            {savingRun ? 'Saving…' : 'Save as new object'}
          </Button>
        </>
      }
    >
      <div className="run-prompt-overlay-body">
        <div className="run-prompt-object-ref">
          <span className="run-prompt-object-ref-label">Using object</span>
          <span className="run-prompt-object-ref-type">{objectType}</span>
          <span className="run-prompt-object-ref-title">{objectTitle}</span>
        </div>
        <div className="run-prompt-source-row">
          <span className="run-prompt-source-label">Source</span>
          <div className="run-prompt-source-tabs">
            <button
              type="button"
              className={`run-prompt-source-tab ${runPromptSource === 'bank' ? 'active' : ''}`}
              aria-pressed={runPromptSource === 'bank'}
              onClick={() => {
                setRunPromptSource('bank');
                syncTemplateText();
              }}
            >
              Prompt Bank
            </button>
            <button
              type="button"
              className={`run-prompt-source-tab ${runPromptSource === 'custom' ? 'active' : ''}`}
              aria-pressed={runPromptSource === 'custom'}
              onClick={() => {
                setRunPromptSource('custom');
                setRunTemplateId('');
                setRunPromptText('');
                setRunPromptEditFromBank(false);
              }}
            >
              Custom prompt
            </button>
          </div>
        </div>
        {runPromptSource === 'bank' && (
          <div className="run-prompt-bank-row">
            <Field label="Template">
              {(ids) => (
                <Select
                  id={ids.id}
                  value={runTemplateId}
                  onChange={(e) => setRunTemplateId(e.target.value)}
                  className="run-prompt-template-select"
                >
                  <option value="">Select a prompt</option>
                  {applicableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {runTemplateId && (
              <label className="run-prompt-edit-check">
                <input
                  type="checkbox"
                  checked={runPromptEditFromBank}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRunPromptEditFromBank(checked);
                    const t = promptTemplates.find((x) => x.id === runTemplateId);
                    if (t?.prompt_text != null) setRunPromptText(t.prompt_text);
                  }}
                />
                Edit before running
              </label>
            )}
          </div>
        )}
        <Field label="Prompt" className="run-prompt-prompt-block">
          {(ids) => (
            <textarea
              id={ids.id}
              value={runPromptText}
              onChange={(e) => setRunPromptText(e.target.value)}
              className="run-prompt-prompt-input"
              rows={runPromptSource === 'custom' ? 6 : 5}
              placeholder={
                runPromptSource === 'custom' ? 'Type your prompt…' : 'Select a template or enable "Edit before running".'
              }
              disabled={runPromptSource === 'bank' && !runPromptEditFromBank && !!runTemplateId}
            />
          )}
        </Field>
        <details
          className="run-prompt-context-details"
          open={runContextOpen}
          onToggle={(e) => setRunContextOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="run-prompt-context-summary">Content sent to AI (from this object)</summary>
          <div className="run-prompt-context-body">
            <p className="run-prompt-context-title">{objectTitle}</p>
            <div className="run-prompt-context-preview">
              {(object?.content ?? '').slice(0, 800)}
              {(object?.content?.length ?? 0) > 800 ? '…' : ''}
            </div>
          </div>
        </details>
        {error && (
          <p className="run-prompt-overlay-error" role="alert">
            {error}
          </p>
        )}
        <Field label="Provider" className="run-prompt-model-row">
          {(ids) => (
            <Select
              id={ids.id}
              value={runAiProviderId ?? ''}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="run-prompt-template-select"
            >
              {(AI_PROVIDERS as Array<{ id: string; label: string }>).map((p, i) => (
                <option key={p.id} value={i === 0 ? '' : serverSelection(p.id)}>
                  Default (server {p.label} key)
                </option>
              ))}
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({aiProviderLabel(p.provider_type)})</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="AI model" className="run-prompt-model-row">
          {(ids) => (
            <Select
              id={ids.id}
              value={effectiveModel}
              onChange={(e) => setRunAiModel(e.target.value)}
              className="run-prompt-template-select"
            >
              {allowedModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="run-prompt-generate-row">
          <Button variant="primary" className="run-prompt-generate-btn" onClick={onGenerateWithAI} loading={generatingAI}>
            {generatingAI ? 'Generating…' : 'Generate with AI'}
          </Button>
        </div>
        <Field label="Output" className="run-prompt-output-block">
          {(ids) => (
            <textarea
              id={ids.id}
              value={runOutput}
              onChange={(e) => setRunOutput(e.target.value)}
              className="run-prompt-output-input"
              rows={8}
              placeholder="Generate with AI or paste your own…"
            />
          )}
        </Field>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title={generatingAI ? 'Stop generating?' : 'Discard the AI output?'}
        message={generatingAI ? 'The response in progress will be lost.' : "The generated text hasn't been saved."}
        confirmLabel={generatingAI ? 'Stop and close' : 'Discard'}
        cancelLabel={generatingAI ? 'Keep waiting' : 'Keep editing'}
        danger
        onConfirm={discardAndClose}
        onCancel={keepEditing}
      />
    </Dialog>
  );
}
