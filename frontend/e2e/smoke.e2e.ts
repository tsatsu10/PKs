import { test, expect } from '@playwright/test';
import {
  E2E_EMAIL, E2E_PASSWORD, adminClient, createObject, e2eUserId, editorSurface, marker, openObject,
  serverContentText, typeAtEnd,
} from './support';

/** Spec 2c smoke tests: login, create, autosave, search, add a link, trash and restore. */

const SERVER_TIMEOUT_MS = 15_000;

/** A word full-text search indexes as itself (letters only, no stemming surprises). */
const searchWord = () => `zq${Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login with email and password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    // The always-pass Turnstile test key enables the button once its token arrives.
    const submit = page.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test('create an object', async ({ page }) => {
  const title = marker('Created');
  await page.goto('/objects/new');
  await page.locator('.notion-title-input').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/objects\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  const { data, error } = await adminClient().from('knowledge_objects').select('title, user_id').eq('id', id).single();
  expect(error).toBeNull();
  expect(data).toEqual({ title, user_id: await e2eUserId() });
  await expect(editorSurface(page)).toBeVisible();
});

test('autosave: typing saves without a button', async ({ page }) => {
  const { id } = await createObject('E2E autosave');
  const text = marker('autosave');
  await openObject(page, id);
  await expect(page.getByRole('button', { name: /^(Edit|Save)$/ })).toHaveCount(0);
  await typeAtEnd(page, text);
  await expect(page.locator('.save-indicator')).toHaveText('Saved ✓', { timeout: SERVER_TIMEOUT_MS });
  expect(await serverContentText(id)).toContain(text);
});

test('search finds an object by a word in its title', async ({ page }) => {
  const word = searchWord();
  const { id } = await createObject(`Findable ${word}`);
  await page.goto('/search');
  await page.getByLabel('Search', { exact: true }).fill(word);
  await page.getByLabel('Search', { exact: true }).press('Enter');
  const result = page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: new RegExp(word) });
  await expect(result).toBeVisible({ timeout: SERVER_TIMEOUT_MS });
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/objects/${id}$`));
});

test('add a link to another object', async ({ page }) => {
  const word = searchWord();
  const target = await createObject(`Link target ${word}`);
  const { id } = await createObject('E2E link source');
  await openObject(page, id);

  await page.getByLabel('Search objects to link').fill(word);
  const option = page.locator('.detail-link-search-dropdown').filter({ hasText: word });
  await option.getByRole('button', { name: 'Link' }).click();

  await expect.poll(async () => {
    const { data } = await adminClient().from('link_edges').select('to_object_id').eq('from_object_id', id);
    return (data ?? []).map((r) => r.to_object_id);
  }, { timeout: SERVER_TIMEOUT_MS }).toContain(target.id);
  await page.reload();
  await expect(page.getByRole('link', { name: `Link target ${word}` }).first()).toBeVisible();
});

test('move to trash, undo, then trash and restore', async ({ page }) => {
  const title = marker('Trashable');
  const { id } = await createObject(title);
  const isDeleted = async () => {
    const { data } = await adminClient().from('knowledge_objects').select('is_deleted').eq('id', id).single();
    return data?.is_deleted;
  };
  await openObject(page, id);

  // No confirmation dialog any more (U5): the toast offers Undo instead.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(isDeleted, { timeout: SERVER_TIMEOUT_MS }).toBe(true);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(isDeleted, { timeout: SERVER_TIMEOUT_MS }).toBe(false);

  await openObject(page, id);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(isDeleted, { timeout: SERVER_TIMEOUT_MS }).toBe(true);

  await page.goto('/trash');
  const row = page.locator('.trash-item').filter({ hasText: title });
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(isDeleted, { timeout: SERVER_TIMEOUT_MS }).toBe(false);

  await openObject(page, id);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
});
