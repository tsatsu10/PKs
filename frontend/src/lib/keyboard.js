/**
 * True when keyboard input is going into a text field or rich-text editor,
 * so global single-key shortcuts (?, /, j, k, 1-3…) must not fire.
 * Checks the contenteditable attribute on ancestors because jsdom and some
 * browsers don't report isContentEditable for nested editor nodes.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isTypingTarget(el) {
  if (!el || typeof el.tagName !== 'string') return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  if (el.isContentEditable === true) return true;
  const editable = el.closest?.('[contenteditable]');
  return editable != null && editable.getAttribute('contenteditable') !== 'false';
}
