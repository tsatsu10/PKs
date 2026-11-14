import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCallback, useEffect } from 'react';
import { hookWrapper, TEST_OBJECT } from './testUtils';

vi.mock('../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../test/supabaseMock');
  return { supabase: mockSupabase().client };
});
vi.mock('../../components/BlockNoteEditor', () => ({
  default: ({ initialValue, onChange }: { initialValue?: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Content" defaultValue={initialValue} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import Editor from './Editor';
import EditForm from './EditForm';
import { useEditSession } from './hooks/useEditSession';

describe('Editor', () => {
  it('forwards changes without re-rendering its parent', () => {
    const rendered = vi.fn();
    const seen: string[] = [];
    function Parent() {
      rendered();
      const onChange = useCallback((md: string) => { seen.push(md); }, []);
      return <Editor initialValue="start" onChange={onChange} />;
    }
    render(<Parent />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: 'typed' } });
    expect(seen).toEqual(['typed']);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it('typing content in the edit form does not re-render the page; the session holds it', () => {
    const rendered = vi.fn();
    const sessions: Array<ReturnType<typeof useEditSession>> = [];
    function Page() {
      rendered();
      const edit = useEditSession({ id: 'o1', object: TEST_OBJECT, isOwner: true, draft: null, setObject: vi.fn(), setError: vi.fn(), userId: 'owner' });
      sessions.push(edit);
      const { start } = edit;
      useEffect(() => { start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return edit.editing ? <EditForm object={TEST_OBJECT} isOwner edit={edit} /> : null;
    }
    const Wrapper = hookWrapper();
    render(<Wrapper><Page /></Wrapper>);
    const box = screen.getByRole('textbox', { name: 'Content' });
    expect(box).toHaveValue('body');
    const before = rendered.mock.calls.length;
    act(() => { fireEvent.change(box, { target: { value: 'body plus' } }); });
    expect(rendered).toHaveBeenCalledTimes(before);
    expect(sessions[sessions.length - 1].contentRef.current).toBe('body plus');
  });
});
