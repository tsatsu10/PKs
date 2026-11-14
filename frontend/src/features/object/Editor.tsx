import { memo, type ComponentType } from 'react';
import BlockNoteEditorJs from '../../components/BlockNoteEditor';

type Props = { initialValue: string; onChange: (markdown: string) => void };

// The JS component's inferred props make every prop required; these are the ones it reads.
const BlockNoteEditor = BlockNoteEditorJs as unknown as ComponentType<Props & { minHeight?: number; 'aria-label'?: string }>;

/**
 * The content editor. It takes its starting value once and reports changes through `onChange`;
 * the parent keeps the value in a ref, so typing doesn't re-render the page (P3).
 */
function Editor({ initialValue, onChange }: Props) {
  return <BlockNoteEditor initialValue={initialValue} onChange={onChange} minHeight={280} aria-label="Content" />;
}

export default memo(Editor);
