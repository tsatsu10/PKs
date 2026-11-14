import { useEffect } from 'react';
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
      <button type="button" className="btn btn-primary detail-synthesize-btn" onClick={run.openRunPanel}>
        Run prompt
      </button>
    </div>
  );
}

type PanelProps = { object: ObjectRow; run: Run; promptTemplates: PromptTemplate[]; error: string };

/**
 * Run prompt overlay: source, template, prompt, provider (default or user's API), model, context, generate, output.
 */
export function RunPromptPanel({ object, run, promptTemplates, error }: PanelProps) {
  const {
    runPromptSource, setRunPromptSource, runTemplateId, setRunTemplateId, runPromptText, setRunPromptText,
    runPromptEditFromBank, setRunPromptEditFromBank, aiProviders, runAiProviderId, setRunAiProviderId,
    runAiModel, setRunAiModel, applicableTemplates, runContextOpen, setRunContextOpen, generatingAI,
    runOutput, setRunOutput, savingRun, onGenerateWithAI, onSaveRun, onSaveOutputAsObject, closeRunPanel: onClose,
  } = run;
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
    <div
      className="run-prompt-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-prompt-title"
      aria-description={`Running prompt against: ${objectTitle}`}
    >
      <div className="run-prompt-overlay-backdrop" onClick={onClose} />
      <div className="run-prompt-overlay-panel">
        <header className="run-prompt-overlay-header">
          <h2 id="run-prompt-title" className="run-prompt-overlay-title">
            Run prompt on this object
          </h2>
          <button type="button" className="run-prompt-overlay-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="run-prompt-overlay-body">
          <div className="run-prompt-object-ref" role="status">
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
              <label className="run-prompt-select-label">Template</label>
              <select
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
              </select>
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
          <div className="run-prompt-prompt-block">
            <label className="run-prompt-prompt-label">Prompt</label>
            <textarea
              value={runPromptText}
              onChange={(e) => setRunPromptText(e.target.value)}
              className="run-prompt-prompt-input"
              rows={runPromptSource === 'custom' ? 6 : 5}
              placeholder={
                runPromptSource === 'custom' ? 'Type your prompt…' : 'Select a template or enable "Edit before running".'
              }
              disabled={runPromptSource === 'bank' && !runPromptEditFromBank && !!runTemplateId}
            />
          </div>
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
          <div className="run-prompt-model-row">
            <label className="run-prompt-select-label">Provider</label>
            <select
              value={runAiProviderId ?? ''}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="run-prompt-template-select"
              aria-label="AI provider"
            >
              {(AI_PROVIDERS as Array<{ id: string; label: string }>).map((p, i) => (
                <option key={p.id} value={i === 0 ? '' : serverSelection(p.id)}>
                  Default (server {p.label} key)
                </option>
              ))}
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({aiProviderLabel(p.provider_type)})</option>
              ))}
            </select>
          </div>
          <div className="run-prompt-model-row">
            <label className="run-prompt-select-label">AI model</label>
            <select
              value={effectiveModel}
              onChange={(e) => setRunAiModel(e.target.value)}
              className="run-prompt-template-select"
              aria-label="AI model"
            >
              {allowedModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="run-prompt-generate-row">
            <button
              type="button"
              className="btn btn-primary run-prompt-generate-btn"
              onClick={onGenerateWithAI}
              disabled={generatingAI}
            >
              {generatingAI ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
          <div className="run-prompt-output-block">
            <label className="run-prompt-output-label">Output</label>
            <textarea
              value={runOutput}
              onChange={(e) => setRunOutput(e.target.value)}
              className="run-prompt-output-input"
              rows={8}
              placeholder="Generate with AI or paste your own…"
            />
          </div>
          <div className="run-prompt-overlay-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-secondary" onClick={onSaveRun} disabled={savingRun}>
              Save run only
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSaveOutputAsObject}
              disabled={savingRun || !runOutput.trim()}
            >
              {savingRun ? 'Saving…' : 'Save as new object'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
