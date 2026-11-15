import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  createObject, editorSurface, marker, openObject, saveIndicator, serverContentText, typeAtEnd,
} from './support';

/**
 * Roadmap / spec 2c exit tests 1 and 2: edit, close the tab within 1 s, reopen, and the content
 * is still there, online and offline-then-reconnect. "Still there" means both on the reopened
 * page and in the database, so an edit that only survived in the browser doesn't pass.
 */

const CLOSE_WITHIN_MS = 1000;
/** Long enough for one pass of the save queue's backoff (1, 2, 5, 10 s…) after a reconnect. */
const SERVER_TIMEOUT_MS = 30_000;

/** Type `text`, then close the tab like a user would (pagehide runs), and check the timing. */
async function typeThenCloseTab(page: Page, text: string) {
  await typeAtEnd(page, text);
  const lastKey = Date.now();
  await page.close({ runBeforeUnload: true });
  if (!page.isClosed()) await page.waitForEvent('close');
  expect(Date.now() - lastKey, 'the tab must close within 1 s of the last keystroke').toBeLessThan(CLOSE_WITHIN_MS);
}

async function reopen(context: BrowserContext, objectId: string) {
  const page = await context.newPage();
  await openObject(page, objectId);
  return page;
}

test('edit, close the tab within 1 s, reopen: the content is there (online)', async ({ context }) => {
  const { id } = await createObject('E2E close online');
  const text = marker('online');

  const page = await context.newPage();
  await openObject(page, id);
  await typeThenCloseTab(page, text);

  const again = await reopen(context, id);
  await expect(editorSurface(again)).toContainText(text);
  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(text);

  // And a cold load (nothing pending any more) shows it from the server.
  await again.reload();
  await expect(editorSurface(again)).toContainText(text);
});

test('edit offline, close the tab within 1 s, reconnect, reopen: the content is there', async ({ context }) => {
  const { id } = await createObject('E2E close offline');
  const text = marker('offline');

  const page = await context.newPage();
  await openObject(page, id);
  await context.setOffline(true);
  await typeThenCloseTab(page, text);

  // Nothing could have been sent.
  expect(await serverContentText(id)).not.toContain(text);

  await context.setOffline(false);
  const again = await reopen(context, id);
  await expect(editorSurface(again)).toContainText(text);
  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(text);

  await again.reload();
  await expect(editorSurface(again)).toContainText(text);
});

test('edit offline with the tab open, reconnect: it saves without a reload', async ({ context }) => {
  const { id } = await createObject('E2E reconnect');
  const text = marker('reconnect');

  const page = await context.newPage();
  await openObject(page, id);
  await context.setOffline(true);
  await typeAtEnd(page, text);
  await expect(saveIndicator(page)).toHaveText('Not saved: offline');
  expect(await serverContentText(id)).not.toContain(text);

  await context.setOffline(false);
  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(text);
  await expect(saveIndicator(page)).not.toHaveText(/Not saved/);

  await page.reload();
  await expect(editorSurface(page)).toContainText(text);
});
