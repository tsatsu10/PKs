import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  adminClient, createObject, editorSurface, marker, openObject, saveIndicator, serverContentText, typeAtEnd,
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

/**
 * Cut the network and wait until the app has noticed (its offline banner). Otherwise a tab closed
 * within a few hundred ms still thinks it is online and sends with keepalive, and Playwright's
 * offline emulation does not hold back a keepalive request that outlives its page.
 */
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
}

/**
 * Diagnostics for a one-off failure (CI run 43770410105): the offline close-tab test once found the
 * edit on the server. Log connection events, pagehide and every write the page starts, so a repeat
 * shows whether the app thought it was online at close or a blocked request got through anyway.
 * Returns the lines collected so far; they also land in the trace as console messages.
 */
async function recordConnectionEvents(context: BrowserContext): Promise<string[]> {
  const lines: string[] = [];
  context.on('console', (msg) => { if (msg.text().startsWith('[e2e]')) lines.push(msg.text()); });
  await context.addInitScript(() => {
    const t0 = performance.now();
    const log = (m: string) => {
      const line = `[e2e] +${Math.round(performance.now() - t0)}ms ${m} onLine=${navigator.onLine}`;
      console.log(line);
      // Also kept synchronously in localStorage: console messages stop once Playwright detaches
      // from a closing page, localStorage outlives it.
      try { localStorage.setItem('e2e-log', `${localStorage.getItem('e2e-log') ?? ''}${Date.now()} ${location.pathname} ${line}
`); } catch { /* opaque origin */ }
    };
    for (const ev of ['online', 'offline', 'pagehide']) addEventListener(ev, () => log(ev));
    document.addEventListener('visibilitychange', () => log(`visibility=${document.visibilityState}`));
    const base = window.fetch;
    window.fetch = (input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        log(`fetch ${method} ${new URL(url, location.href).pathname} keepalive=${Boolean(init?.keepalive)}`);
      }
      return base(input, init);
    };
  });
  return lines;
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

  // The save sent as the tab closed (keepalive) arrives without the tab ever being reopened.
  await expect.poll(() => serverContentText(id), { timeout: 5_000 }).toContain(text);

  const again = await reopen(context, id);
  await expect(editorSurface(again)).toContainText(text);

  // And a cold load (nothing pending any more) shows it from the server.
  await again.reload();
  await expect(editorSurface(again)).toContainText(text);
});

test('edit offline, close the tab within 1 s, reconnect, reopen: the content is there', async ({ context }) => {
  const { id } = await createObject('E2E close offline');
  const text = marker('offline');
  const events = await recordConnectionEvents(context);

  const page = await context.newPage();
  await openObject(page, id);
  await goOffline(page);
  const typedAt = new Date().toISOString();
  await typeThenCloseTab(page, text);
  const closedAt = new Date().toISOString();

  // Nothing could have been sent.
  const serverText = await serverContentText(id);
  const stored = (await context.storageState()).origins
    .flatMap((o) => o.localStorage).find((e) => e.name === 'e2e-log')?.value ?? '(none)';
  console.log(`[netlog-debug] ${id} leaked=${serverText.includes(text)}
${stored}`);
  if (serverText.includes(text)) {
    const { data: row } = await adminClient().from('knowledge_objects')
      .select('revision, updated_at, current_version').eq('id', id).single();
    events.push(`object ${id} typedAt=${typedAt} closedAt=${closedAt} row=${JSON.stringify(row)}`);
  }
  expect(serverText, `page events:\n${events.join('\n')}`).not.toContain(text);

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
  await goOffline(page);
  await typeAtEnd(page, text);
  await expect(saveIndicator(page)).toHaveText('Not saved: offline');
  expect(await serverContentText(id)).not.toContain(text);

  await context.setOffline(false);
  await expect.poll(() => serverContentText(id), { timeout: SERVER_TIMEOUT_MS }).toContain(text);
  await expect(saveIndicator(page)).not.toHaveText(/Not saved/);

  await page.reload();
  await expect(editorSurface(page)).toContainText(text);
});
