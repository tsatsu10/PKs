/* global process */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createObject } from './support';

/**
 * Phase 0b-1: axe smoke test, report mode.
 *
 * One pass per route and theme. Unset A11Y_STRICT logs an [axe] line per pass and always
 * passes (the 0b-1 baseline). A11Y_STRICT=1 (set in CI from part 4 on) fails the test on
 * any serious or critical violation.
 */

const THEMES = ['dark', 'light'] as const;
const AUTH_ROUTES = ['/', '/search', '/settings', '/trash', '/prompts'] as const;
const STRICT = process.env.A11Y_STRICT === '1';

type AxeSummary = {
  route: string;
  theme: string;
  serious: number;
  critical: number;
  ids: string[];
};

async function runAxe(page: Page, route: string, theme: string, results: AxeSummary[]) {
  await page.addInitScript((t) => localStorage.setItem('pks-theme', t), theme);
  await page.goto(route);
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary: AxeSummary = {
    route,
    theme,
    serious: violations.filter((v) => v.impact === 'serious').length,
    critical: violations.filter((v) => v.impact === 'critical').length,
    ids: [...new Set(violations.map((v) => v.id))],
  };
  results.push(summary);
  console.log(
    `[axe] ${route} (${theme}): ${summary.serious} serious, ${summary.critical} critical` +
      (summary.ids.length ? ` — ${summary.ids.join(', ')}` : ''),
  );
}

function expectStrict(results: AxeSummary[]) {
  if (!STRICT) return;
  for (const r of results) {
    expect(r.serious + r.critical, `${r.route} (${r.theme}): ${r.ids.join(', ')}`).toBe(0);
  }
}

test('authenticated routes, both themes', async ({ page }) => {
  const { id } = await createObject('Axe smoke target');
  const results: AxeSummary[] = [];
  for (const theme of THEMES) {
    for (const route of ['/', `/objects/${id}`, ...AUTH_ROUTES]) {
      await runAxe(page, route, theme, results);
    }
  }
  await test.info().attach('axe-report', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  expectStrict(results);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login, both themes', async ({ page }) => {
    const results: AxeSummary[] = [];
    for (const theme of THEMES) {
      await runAxe(page, '/login', theme, results);
    }
    await test.info().attach('axe-report', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
    expectStrict(results);
  });
});
