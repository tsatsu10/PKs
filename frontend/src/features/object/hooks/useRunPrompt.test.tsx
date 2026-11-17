import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useRunPrompt } from './useRunPrompt';

const TEMPLATES = [
  { id: 'p1', name: 'Tasks only', prompt_text: 'a', applies_to_types: ['task'] },
  { id: 'p2', name: 'Any', prompt_text: 'b', applies_to_types: null },
];

function setup() {
  return renderHook(() => useRunPrompt({
    object: TEST_OBJECT, userId: 'owner', promptTemplates: TEMPLATES, setPromptRuns: vi.fn(), setError: vi.fn(),
  }), { wrapper: hookWrapper() });
}

const shortcut = () => document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'R', bubbles: true }));

beforeEach(() => {
  sb.current!.respond = () => ({ data: [], error: null });
});
// Unmount first: the Toaster portals into body, and React must remove its own nodes.
afterEach(() => { cleanup(); document.body.replaceChildren(); });

describe('useRunPrompt', () => {
  it('Ctrl+Shift+R opens the panel with the first applicable template', () => {
    const { result } = setup();
    expect(result.current.applicableTemplates.map((t) => t.id)).toEqual(['p2']);
    act(shortcut);
    expect(result.current.showRunPanel).toBe(true);
    expect(result.current.runTemplateId).toBe('p2');
  });

  it('Ctrl+Shift+R while typing in an input does nothing', () => {
    const { result } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(shortcut);
    expect(result.current.showRunPanel).toBe(false);
  });
});
