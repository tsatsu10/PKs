import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  createObject, editorSurface, marker, openObject, saveIndicator, serverContentText, serverVersions, typeAtEnd,
} from './support';

/**
 * Spec 2c exit test 3: two browsers edit the same object. The second save hits a newer revision
 * and gets the conflict bar. Keep mine and Load theirs each end with the expected text, and the
 * side that lost is kept in version history.
 */

// Reasons the save queue sends (saveQueue.ts KEEP_MINE_REASON / LOAD_THEIRS_REASON).
const KEEP_MINE_REASON = 'Kept from a conflict before overwrite';
const LOAD_THEIRS_REASON = 'Unsaved edit kept from a conflict';
const SERVER_TIMEOUT_MS = 15_000;

/** A second, separate browser (own IndexedDB and cache) signed in as the same user. */
async function secondBrowser(browser: Browser): Promise<Page> {
  const { baseURL, storageState } = test.info().project.use;
  const context = await browser.newContext({ baseURL, storageState });
  return context.newPage();
}

/** Both open the object; A saves first, then B edits the now-outdated copy and gets the bar. */
async function setUpConflict(a: Page, b: Page, label: string) {
  const { id } = await createObject(`E2E conflict ${label}`);
  const textA = marker(`${label}-A`);
  const textB = marker(`${label}-B`);

  await openObject(a, id);
  await openObject(b, id);

  await typeAtEnd(a, textA);
  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(textA);

  await typeAtEnd(b, textB);
  await expect(b.locator('.conflict-bar')).toBeVisible({ timeout: SERVER_TIMEOUT_MS });
  await expect(b.locator('.conflict-bar')).toContainText('This changed elsewhere.');
  // Autosave is paused: B's text has not reached the server.
  expect(await serverContentText(id)).not.toContain(textB);

  return { id, textA, textB };
}

test('conflict: Keep mine saves my text and keeps theirs in history', async ({ page: a, browser }) => {
  const b = await secondBrowser(browser);
  const { id, textA, textB } = await setUpConflict(a, b, 'keep');

  await b.getByRole('button', { name: 'Keep mine' }).click();
  await expect(b.locator('.conflict-bar')).toHaveCount(0);

  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(textB);
  // B's editor never had A's line, so "mine" replaces it.
  expect(await serverContentText(id)).not.toContain(textA);
  await expect(saveIndicator(b)).not.toHaveText(/Not saved/);

  const kept = (await serverVersions(id)).find((v) => v.change_reason === KEEP_MINE_REASON);
  expect(kept, 'their version is in history').toBeTruthy();
  expect(kept!.text).toContain(textA);

  await b.reload();
  await expect(editorSurface(b)).toContainText(textB);
  await expect(b.locator('#version-history li').first()).toBeVisible();
  await b.context().close();
});

test('conflict: Load theirs shows their text and keeps mine in history', async ({ page: a, browser }) => {
  const b = await secondBrowser(browser);
  const { id, textA, textB } = await setUpConflict(a, b, 'load');

  await b.getByRole('button', { name: 'Load theirs' }).click();
  await expect(b.locator('.conflict-bar')).toHaveCount(0);
  await expect(b.getByText('Your version was saved to history')).toBeVisible();

  await expect(editorSurface(b)).toContainText(textA);
  await expect(editorSurface(b)).not.toContainText(textB);
  const server = await serverContentText(id);
  expect(server).toContain(textA);
  expect(server).not.toContain(textB);

  const mine = (await serverVersions(id)).find((v) => v.change_reason === LOAD_THEIRS_REASON);
  expect(mine, 'my unsent edit is in history').toBeTruthy();
  expect(mine!.text).toContain(textB);

  // Loading theirs dropped my edit locally too: a reload does not bring it back.
  await b.reload();
  await expect(editorSurface(b)).toContainText(textA);
  await expect(editorSurface(b)).not.toContainText(textB);
  await expect(b.locator('#version-history li').first()).toBeVisible();
  await b.context().close();
});
