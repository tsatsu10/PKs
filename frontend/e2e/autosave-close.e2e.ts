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

/**
 * Cut the network and wait until the app has noticed (its offline banner). Otherwise a tab closed
 * within a few hundred ms still thinks it is online and sends with keepalive, and a request that
 * outlives its page escapes Playwright's offline emulation (see `reconnectedDuringClose`).
 */
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
}

/**
 * Record connection events, pagehide and every write the page starts. The log is kept in
 * localStorage, synchronously: console messages stop once Playwright detaches from a closing page,
 * and that is exactly the moment that matters (see `reconnectedDuringClose`).
 */
async function recordConnectionEvents(context: BrowserContext) {
  await context.addInitScript(() => {
    const log = (m: string) => {
      try {
        localStorage.setItem('e2e-events', `${localStorage.getItem('e2e-events') ?? ''}${m} onLine=${navigator.onLine}\n`);
      } catch { /* opaque origin */ }
    };
    for (const ev of ['online', 'offline', 'pagehide']) addEventListener(ev, () => log(ev));
    const base = window.fetch;
    window.fetch = (input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        log(`fetch ${method} ${new URL(url, location.href).pathname}`);
      }
      return base(input, init);
    };
  });
}

async function recordedEvents(context: BrowserContext): Promise<string[]> {
  const entry = (await context.storageState()).origins
    .flatMap((o) => o.localStorage).find((e) => e.name === 'e2e-events');
  return (entry?.value ?? '').split('\n').filter(Boolean);
}

/**
 * Playwright lifts a page's network emulation (setOffline, and the user agent) when it detaches
 * from the page during close, while the page can still run. The page then gets a real `online`
 * event, and the save queue rightly sends. (CI runs 43770410105, 43779922026, 43783271491; in a
 * 46-run diagnosis `online` fired after pagehide in 37, and once the PATCH reached the server
 * before the renderer died.) That is the harness reconnecting, not the app saving while offline.
 */
function reconnectedDuringClose(events: string[]): boolean {
  const hide = events.findIndex((e) => e.startsWith('pagehide') && e.endsWith('onLine=false'));
  return hide >= 0 && events.slice(hide).some((e) => e.startsWith('online'));
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
  await recordConnectionEvents(context);

  const page = await context.newPage();
  await openObject(page, id);
  await goOffline(page);
  await typeThenCloseTab(page, text);

  // Nothing could have been sent while the browser was offline. If the edit is on the server
  // anyway, it must be because the harness went back online during close; otherwise it's a bug.
  if ((await serverContentText(id)).includes(text)) {
    const events = await recordedEvents(context);
    expect(reconnectedDuringClose(events), `saved while offline; page events:\n${events.join('\n')}`).toBe(true);
    test.info().annotations.push({
      type: 'note',
      description: 'The browser went online during close and the edit was sent then; the reopen-and-resend path was not exercised this run.',
    });
  }

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
