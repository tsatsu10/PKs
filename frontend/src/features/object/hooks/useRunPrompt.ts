import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { isTypingTarget } from '../../../lib/keyboard';
import { createNotification } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { deliverWebhookEvent } from '../../../lib/webhooks';
import { getDeepSeekErrorMessage } from '../../../lib/deepseekKey';
import { resolveRunSelection, modelForProvider, isServerSelection } from '../../../lib/aiProviders';
import { getErrorMessage } from '../../../lib/errors';
import { useNotifyError } from '../../../lib/useNotifyError';
import { useToast } from '../../../components/ui/Toaster';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY, DEFAULT_AI_MODEL } from '../../../constants';
import { useAiProviders } from '../../../data/settings';
import { invalidateObjectLists } from '../../../data/objects';
import type { ObjectRow, PromptTemplate, PromptRun, ListSetter, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  promptTemplates: PromptTemplate[];
  setPromptRuns: ListSetter<PromptRun>;
  setError: SetError;
};
type RunRow = { id: string; created_at: string };
export type AiProvider = { id: string; name: string; provider_type: string };
type FnErrorBody = { run?: RunRow; code?: string; retryAfter?: number; hint?: string; error?: string; detail?: string };

const appliesTo = (t: PromptTemplate, type: string | undefined) =>
  !(t.applies_to_types && t.applies_to_types.length) || (t.applies_to_types || []).includes(type as string);

const ellipsis = (s: string, n: number) => `${s.slice(0, n)}${s.length > n ? '…' : ''}`;

/**
 * The run-prompt panel: its state, the Ctrl+Shift+R shortcut, the `?runPrompt=` link,
 * and generate / save-run / save-as-object.
 */
export function useRunPrompt({ object, userId, promptTemplates, setPromptRuns, setError }: Options) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const runPromptFromUrl = searchParams.get('runPrompt');
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const notifyError = useNotifyError();
  const providersQ = useAiProviders(userId ?? null);
  const aiProviders = useMemo(() => (providersQ.data ?? []) as AiProvider[], [providersQ.data]);

  const [runTemplateId, setRunTemplateId] = useState('');
  const [runPromptText, setRunPromptText] = useState('');
  const [runAiModel, setRunAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [runAiProviderId, setRunAiProviderId] = useState<string | null>(null);
  const [runPromptSource, setRunPromptSource] = useState('bank');
  const [runPromptEditFromBank, setRunPromptEditFromBank] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [lastRun, setLastRun] = useState<RunRow | null>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [runContextOpen, setRunContextOpen] = useState(false);
  /** Asking whether to throw away unsaved output before closing (A5). */
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const applicableTemplates = promptTemplates.filter((t) => appliesTo(t, object?.type));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        if (isTypingTarget(document.activeElement)) return;
        e.preventDefault();
        if (!object || !promptTemplates?.length) return;
        const applicable = promptTemplates.filter((t) => appliesTo(t, object.type));
        if (!applicable.length) return;
        setShowRunPanel(true);
        setRunTemplateId((current) => current || applicable[0].id);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [object, promptTemplates]);

  useEffect(() => {
    if (!showRunPanel || runPromptSource !== 'bank' || !runTemplateId || runPromptEditFromBank) return;
    const template = promptTemplates.find((t) => t.id === runTemplateId);
    if (template?.prompt_text != null) setRunPromptText(template.prompt_text);
  }, [showRunPanel, runPromptSource, runTemplateId, runPromptEditFromBank, promptTemplates]);

  // Clear provider selection if the selected provider was removed (e.g. in another tab)
  useEffect(() => {
    if (!isServerSelection(runAiProviderId) && aiProviders.length > 0 && !aiProviders.some((p) => p.id === runAiProviderId)) {
      setRunAiProviderId(null);
    }
  }, [runAiProviderId, aiProviders]);

  useEffect(() => {
    if (!runPromptFromUrl || !object || !promptTemplates?.length) return;
    const template = promptTemplates.find((t) => t.id === runPromptFromUrl);
    if (!template || !appliesTo(template, object.type)) return;
    setRunTemplateId(runPromptFromUrl);
    setShowRunPanel(true);
    try {
      sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY);
    } catch (_e) { void _e; }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('runPrompt');
      return next;
    }, { replace: true });
  }, [runPromptFromUrl, object, promptTemplates, setSearchParams]);

  function openRunPanel() {
    if (!object) return;
    setError('');
    setShowRunPanel(true);
    setRunOutput('');
    if (runPromptSource === 'bank' && runTemplateId) {
      const template = promptTemplates.find((t) => t.id === runTemplateId);
      if (template?.prompt_text != null) setRunPromptText(template.prompt_text);
      setRunPromptEditFromBank(false);
    }
    if (runPromptSource === 'custom') setRunPromptText('');
  }

  function closeRunPanel() {
    setShowRunPanel(false);
    setRunOutput('');
    setConfirmDiscard(false);
  }

  /** Escape, the backdrop, Close and Cancel: close at once, or ask first when there is output to lose. */
  function requestCloseRunPanel() {
    if (runOutput.trim() === '') closeRunPanel();
    else setConfirmDiscard(true);
  }

  function keepEditing() {
    setConfirmDiscard(false);
  }

  async function onGenerateWithAI() {
    if (!object) return;
    const promptToUse = runPromptText.trim();
    if (!promptToUse) {
      setError('Enter a prompt or select one from the Prompt Bank.');
      return;
    }
    setError('');
    setGeneratingAI(true);
    try {
      const { provider, userProviderId } = resolveRunSelection(runAiProviderId, aiProviders);
      const { data, error: fnErr } = await supabase.functions.invoke('run-prompt', {
        body: {
          promptText: promptToUse,
          object_id: object.id,
          prompt_template_id: runTemplateId || undefined,
          provider,
          model: modelForProvider(provider, runAiModel || DEFAULT_AI_MODEL, !userProviderId),
          user_provider_id: userProviderId || undefined,
        },
      });
      if (fnErr) {
        let msg = getErrorMessage(fnErr, 'AI request failed');
        const genericMsg = /non-2xx|Edge Function returned|Function failed/i.test(msg);
        try {
          const ctx = fnErr?.context;
          if (ctx) {
            const body: FnErrorBody | null = typeof ctx.json === 'function'
              ? await ctx.json()
              : typeof ctx.text === 'function'
                ? JSON.parse(await ctx.text())
                : null;
            if (body && typeof body === 'object') {
              if (body.run) {
                const run = body.run;
                setPromptRuns((prev) => [{ id: run.id, prompt_template_id: runTemplateId || null, status: 'failed', output: body.error || null, created_at: run.created_at }, ...prev]);
              }
              if (body.code === 'RATE_LIMITED') {
                const sec = typeof body.retryAfter === 'number' ? body.retryAfter : 60;
                msg = `Too many requests. Try again in ${sec} second${sec !== 1 ? 's' : ''}.`;
              } else {
                msg =
                  body.hint ||
                  getDeepSeekErrorMessage(
                    body.code,
                    body.error || body.detail || (genericMsg ? 'AI request failed. Check Settings → AI API keys or Edge Function secrets.' : msg)
                  );
              }
            }
          }
        } catch {
          /* response body parse failed, use existing msg */
        }
        if (genericMsg && msg === getErrorMessage(fnErr, '')) {
          msg = 'AI request failed. Check your API key in Settings → AI API keys, or server secrets for default provider.';
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.hint || data.error);
      const outputText = data?.output ?? '';
      setRunOutput(outputText);
      setLastRun(data?.run ?? null);
      if (data?.run) {
        setPromptRuns((prev) => [{ id: data.run.id, prompt_template_id: runTemplateId || null, status: 'completed', output: outputText, created_at: data.run.created_at }, ...prev]);
      }
      if (data?.truncated) addToast('info', 'This object is long, so only its first 50,000 characters were sent to the AI.');
      if (data?.output_truncated) addToast('info', 'The AI hit its length limit, so this answer may be cut off.');
    } catch (err) {
      const msg = getErrorMessage(err, 'AI generation failed.');
      setError(notifyError(err, { message: msg }));
    } finally {
      setGeneratingAI(false);
    }
  }

  async function onSaveRun() {
    if (!object || !userId) return;
    // The server records the run; with no run row back there is nothing saved, so don't claim otherwise.
    // Keep the panel open so the output can still be copied.
    if (!lastRun?.id) {
      setError("This run couldn't be recorded. Copy the output if you need it, then try again.");
      return;
    }
    setError('');
    setSavingRun(true);
    try {
      closeRunPanel();
      setLastRun(null);
      setRunPromptText('');
      setRunTemplateId('');
      createNotification(userId, 'prompt_completed', 'Prompt run saved', `Run saved for "${ellipsis(object.title, 50)}"`, { type: 'knowledge_object', id: object.id });
      logAudit(userId, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, objectTitle: object.title, promptTemplateId: runTemplateId || null });
    } catch (e) {
      setError(notifyError(e, 'Failed to save run'));
    } finally {
      setSavingRun(false);
    }
  }

  async function onSaveOutputAsObject() {
    if (!object || !userId || !runOutput.trim()) return;
    setError('');
    setSavingRun(true);
    try {
      const template = promptTemplates.find((t) => t.id === runTemplateId);
      const title = template ? `${template.name} — ${object.title}` : `Prompt output — ${object.title}`;
      if (!lastRun?.id) throw new Error('Generate an output first.');
      const { data: newId, error: saveErr } = await supabase.rpc('save_prompt_output_as_object', {
        p_run_id: lastRun.id,
        p_title: title,
        p_content: runOutput.trim(),
      });
      if (saveErr) throw saveErr;
      closeRunPanel();
      setLastRun(null);
      setRunTemplateId('');
      setRunPromptText('');
      createNotification(userId, 'prompt_completed', 'Prompt saved as new object', `Created "${ellipsis(title, 60)}"`, { type: 'knowledge_object', id: newId });
      logAudit(userId, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null, created_object_id: newId });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, createdObjectId: newId, promptTemplateId: runTemplateId || null });
      await invalidateObjectLists();
      navigate(`/objects/${newId}`);
    } catch (e) {
      setError(notifyError(e, 'Failed to save as object'));
    } finally {
      setSavingRun(false);
    }
  }

  return {
    showRunPanel, openRunPanel, requestCloseRunPanel, confirmDiscard, discardAndClose: closeRunPanel, keepEditing,
    applicableTemplates, aiProviders,
    runPromptSource, setRunPromptSource, runTemplateId, setRunTemplateId, runPromptText, setRunPromptText,
    runPromptEditFromBank, setRunPromptEditFromBank, runAiProviderId, setRunAiProviderId, runAiModel, setRunAiModel,
    runContextOpen, setRunContextOpen, generatingAI, runOutput, setRunOutput, savingRun,
    onGenerateWithAI, onSaveRun, onSaveOutputAsObject,
  };
}
