import { useMemo, useEffect } from 'react';
import { AI_MODELS } from '../constants';

/**
 * Run prompt overlay: source, template, prompt, provider (default or user's API), model, context, generate, output.
 */
export default function ObjectDetailRunPromptPanel({
  object,
  runPromptSource,
  setRunPromptSource,
  runTemplateId,
  setRunTemplateId,
  runPromptText,
  setRunPromptText,
  runPromptEditFromBank,
  setRunPromptEditFromBank,
  aiProviders = [],
  runAiProviderId,
  setRunAiProviderId,
  runAiModel,
  setRunAiModel,
  promptTemplates,
  applicableTemplates,
  runContextOpen,
  setRunContextOpen,
  error,
  generatingAI,
  runOutput,
  setRunOutput,
  savingRun,
  onGenerateWithAI,
  onSaveRun,
  onSaveOutputAsObject,
  onClose,
}) {
  const selectedProvider = aiProviders.find((p) => p.id === runAiProviderId);
  const allowedModels = useMemo(() => {
    if (!selectedProvider) return AI_MODELS;
    return AI_MODELS.filter((m) => m.provider === selectedProvider.provider_type);
  }, [selectedProvider]);
  const modelInAllowed = allowedModels.some((m) => m.id === runAiModel);
  const effectiveModel = modelInAllowed ? runAiModel : (allowedModels[0]?.id ?? 'gpt-4.1-mini');

  useEffect(() => {
    if (!modelInAllowed && allowedModels[0]) setRunAiModel(allowedModels[0].id);
  }, [modelInAllowed, allowedModels]);

  const syncTemplateText = () => {
    if (runTemplateId) {
      const t = promptTemplates.find((x) => x.id === runTemplateId);
      if (t?.prompt_text != null) setRunPromptText(t.prompt_text);
    }
    setRunPromptEditFromBank(false);
  };

  const objectTitle = object?.title?.trim() || 'Untitled';
  const objectType = object?.type || 'note';

  const handleProviderChange = (providerId) => {
    const id = providerId === '' ? null : providerId;
    setRunAiProviderId(id);
    const provider = id ? aiProviders.find((p) => p.id === id) : null;
    const models = provider ? AI_MODELS.filter((m) => m.provider === provider.provider_type) : AI_MODELS;
    const currentInList = models.some((m) => m.id === runAiModel);
    if (!currentInList && models[0]) setRunAiModel(models[0].id);
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
            onToggle={(e) => setRunContextOpen(e.target.open)}
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
              <option value="">Default (server keys)</option>
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
