import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, openInNewTab, printHtml } from './download';

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('clicks an attached anchor and revokes the URL only later', () => {
    let clickedWhileAttached = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedWhileAttached = document.body.contains(this) && this.download === 'notes.md';
    });
    downloadBlob(new Blob(['x']), 'notes.md');
    expect(clickedWhileAttached).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });
});

describe('openInNewTab', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clicks an attached anchor with noopener, then removes it', () => {
    let clickedWhileAttached = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedWhileAttached = document.body.contains(this) && this.target === '_blank' && this.rel === 'noopener';
    });
    openInNewTab('https://signed.example/file');
    expect(clickedWhileAttached).toBe(true);
    expect(document.querySelectorAll('a[target="_blank"]').length).toBe(0);
  });
});

describe('printHtml', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Appends printHtml's iframe to the body, giving it a mocked document and window. */
  function mockIframe({ withDocument = true } = {}) {
    const doc = withDocument ? { open: vi.fn(), write: vi.fn(), close: vi.fn() } : null;
    const view = { focus: vi.fn(), print: vi.fn(), addEventListener: vi.fn() };
    let frame;
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      frame = node;
      if (withDocument) {
        Object.defineProperty(node, 'contentDocument', { value: doc, configurable: true });
        Object.defineProperty(node, 'contentWindow', { value: view, configurable: true });
      }
      return node;
    });
    return { get frame() { return frame; }, doc, view };
  }

  it('writes the HTML into an off-screen iframe and prints it', () => {
    const mocked = mockIframe();
    expect(printHtml('<p>Hi</p>')).toBe(true);
    const { frame, doc, view } = mocked;
    expect(frame.style.position).toBe('fixed');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(doc.open).toHaveBeenCalled();
    expect(doc.write).toHaveBeenCalledWith('<p>Hi</p>');
    expect(doc.close).toHaveBeenCalled();
    expect(view.focus).toHaveBeenCalled();
    expect(view.print).toHaveBeenCalled();
    expect(view.addEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function), { once: true });
  });

  it('returns false when the iframe has no document', () => {
    mockIframe({ withDocument: false });
    expect(printHtml('<p>Hi</p>')).toBe(false);
  });
});
