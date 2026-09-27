import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, printHtml } from './download';

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

describe('printHtml', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the HTML into a new window and prints it', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const win = { document: doc, focus: vi.fn(), print: vi.fn(), opener: 'x' };
    vi.spyOn(window, 'open').mockReturnValue(win);
    expect(printHtml('<p>Hi</p>')).toBe(true);
    expect(doc.write).toHaveBeenCalledWith('<p>Hi</p>');
    expect(win.print).toHaveBeenCalled();
    expect(win.opener).toBeNull();
  });

  it('returns false when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printHtml('<p>Hi</p>')).toBe(false);
  });
});
