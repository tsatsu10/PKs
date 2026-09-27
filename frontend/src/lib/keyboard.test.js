import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './keyboard';

describe('isTypingTarget', () => {
  it('is true for text fields', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true inside a contenteditable editor (BlockNote/ProseMirror)', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const paragraph = document.createElement('p');
    editor.appendChild(paragraph);
    document.body.appendChild(editor);
    expect(isTypingTarget(editor)).toBe(true);
    expect(isTypingTarget(paragraph)).toBe(true);
    editor.remove();
  });

  it('is false for buttons, plain elements and nothing', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });

  it('is false inside contenteditable="false"', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'false');
    expect(isTypingTarget(el)).toBe(false);
  });
});
