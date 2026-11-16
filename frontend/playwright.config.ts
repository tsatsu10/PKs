/* global process */
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (spec 2c, T4). They need a real Supabase stack (auth + REST), so they run in
 * CI after `supabase start`, against a production build served by `vite preview`.
 * Build first with the stack's VITE_SUPABASE_* values; see e2e/README.md.
 */
const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // `*.e2e.ts`, not `*.spec.ts`, so Vitest never picks these files up.
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Debugging aid: E2E_NETLOG_DIR makes Chromium write its own network log (one file per worker),
    // which includes requests the page's trace can't see, such as keepalive sends after close.
    ...(process.env.E2E_NETLOG_DIR
      ? { launchOptions: { args: [`--log-net-log=${process.env.E2E_NETLOG_DIR}/netlog-${process.pid}.json`] } }
      : {}),
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
