import { test, expect, type Page } from '@playwright/test';
import { createObject, editorSurface, openObject } from './support';

/**
 * Roadmap Phase 0a exit criterion: opening a cached object takes under 100 ms.
 * "Cached": the object was opened earlier in this session, so its data is in the query cache and
 * its page chunk is loaded. Measured in the page, from the in-app navigation to the frame after
 * the object's text is in the editor, so Playwright's own round trips don't count.
 */
const LIMIT_MS = 100;
const RUNS = 5;

/** Navigate in-app (as a link click would, via the router's history) and time it until painted. */
async function timeCachedOpen(page: Page, objectId: string, expectedText: string): Promise<number> {
  return page.evaluate(({ objectId, expectedText }) => new Promise<number>((resolve, reject) => {
    const surface = () => document.querySelector('.blocknote-editor-wrapper [contenteditable="true"]');
    const start = performance.now();
    const done = () => {
      if (!surface()?.textContent?.includes(expectedText)) return false;
      observer.disconnect();
      clearTimeout(timer);
      // The content is in the DOM; the next frame is when the user sees it.
      requestAnimationFrame(() => resolve(performance.now() - start));
      return true;
    };
    const observer = new MutationObserver(() => { done(); });
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('object did not open within 5 s')); }, 5000);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    history.pushState({}, '', `/objects/${objectId}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }), { objectId, expectedText });
}

test('opening a cached object takes under 100 ms', async ({ page }) => {
  const a = await createObject('E2E perf A', 'Object A body.');
  const b = await createObject('E2E perf B', 'Object B body.');

  // Warm: open both once, so both are cached and the object page chunk is loaded.
  await openObject(page, b.id);
  await expect(editorSurface(page)).toContainText('Object B body.');
  await openObject(page, a.id);
  await expect(editorSurface(page)).toContainText('Object A body.');

  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const [target, text] = i % 2 === 0 ? [b.id, 'Object B body.'] : [a.id, 'Object A body.'];
    times.push(await timeCachedOpen(page, target, text));
  }
  times.sort((x, y) => x - y);
  const median = times[Math.floor(times.length / 2)];
  console.log(`[perf] cached open (ms): median ${median.toFixed(1)}, runs ${times.map((t) => t.toFixed(1)).join(', ')}`);
  expect(median, `cached open runs (ms): ${times.join(', ')}`).toBeLessThan(LIMIT_MS);
});
