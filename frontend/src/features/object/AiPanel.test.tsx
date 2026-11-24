import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunPromptPanel } from './AiPanel';
import { TEST_OBJECT } from './testUtils';
import type { useRunPrompt } from './hooks/useRunPrompt';

type Run = ReturnType<typeof useRunPrompt>;

const TEMPLATES = [{ id: 'p2', name: 'Any', prompt_text: 'b', applies_to_types: null }];

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    showRunPanel: true,
    openRunPanel: vi.fn(),
    requestCloseRunPanel: vi.fn(),
    confirmDiscard: false,
    discardAndClose: vi.fn(),
    keepEditing: vi.fn(),
    applicableTemplates: TEMPLATES,
    aiProviders: [],
    runPromptSource: 'bank',
    setRunPromptSource: vi.fn(),
    runTemplateId: '',
    setRunTemplateId: vi.fn(),
    runPromptText: '',
    setRunPromptText: vi.fn(),
    runPromptEditFromBank: false,
    setRunPromptEditFromBank: vi.fn(),
    runAiProviderId: null,
    setRunAiProviderId: vi.fn(),
    runAiModel: '',
    setRunAiModel: vi.fn(),
    runContextOpen: false,
    setRunContextOpen: vi.fn(),
    generatingAI: false,
    runOutput: '',
    setRunOutput: vi.fn(),
    savingRun: false,
    onGenerateWithAI: vi.fn(),
    onSaveRun: vi.fn(),
    onSaveOutputAsObject: vi.fn(),
    ...overrides,
  } as unknown as Run;
}

function renderPanel(overrides: Partial<Run> = {}) {
  const run = makeRun(overrides);
  const utils = render(<RunPromptPanel object={TEST_OBJECT} run={run} promptTemplates={TEMPLATES as never} error="" />);
  return { run, ...utils };
}

describe('RunPromptPanel', () => {
  it('is a dialog named "Run prompt on this object"', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Run prompt on this object' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Running against: First');
  });

  it('closes on Escape when there is no output', () => {
    const { run } = renderPanel();
    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Escape' });
    expect(run.requestCloseRunPanel).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding output on Escape, backdrop and Cancel', () => {
    const { run, rerender } = renderPanel({ runOutput: 'x' });
    fireEvent.keyDown(screen.getByLabelText('Output'), { key: 'Escape' });
    fireEvent.click(document.querySelector('.ui-dialog-backdrop')!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(run.requestCloseRunPanel).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('dialog', { name: 'Discard the AI output?' })).toBeNull();

    const confirming = makeRun({ runOutput: 'x', confirmDiscard: true });
    rerender(<RunPromptPanel object={TEST_OBJECT} run={confirming} promptTemplates={TEMPLATES as never} error="" />);
    const confirm = screen.getByRole('dialog', { name: 'Discard the AI output?' });
    expect(confirm).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(confirming.keepEditing).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(confirming.discardAndClose).toHaveBeenCalledTimes(1);
    // Escape on top of the panel answers the confirm, not the panel.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(confirming.keepEditing).toHaveBeenCalledTimes(2);
    expect(confirming.requestCloseRunPanel).not.toHaveBeenCalled();
  });

  it('labels every field', () => {
    renderPanel();
    expect(screen.getByLabelText('Prompt').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Output').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Template').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Provider').tagName).toBe('SELECT');
    expect(screen.getByLabelText('AI model').tagName).toBe('SELECT');
  });

  it('offers to stop generating', () => {
    const { run } = renderPanel({ generatingAI: true, confirmDiscard: true });
    const confirm = screen.getByRole('dialog', { name: 'Stop generating?' });
    expect(confirm).toHaveAccessibleDescription('The response in progress will be lost.');
    fireEvent.click(screen.getByRole('button', { name: 'Keep waiting' }));
    expect(run.keepEditing).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop and close' }));
    expect(run.discardAndClose).toHaveBeenCalledTimes(1);
  });
});
