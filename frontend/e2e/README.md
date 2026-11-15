# End-to-end tests (Playwright)

These tests drive the real app against a real Supabase stack (auth + REST), so they need
`supabase start`. That needs Docker, so they run in CI (the `e2e` job in
`.github/workflows/ci.yml`), not on the owner's machine.

## What they cover

- `autosave-close.e2e.ts`: the 2c exit tests. Edit, close the tab within 1 s, reopen, and
  the content is there, both online and offline-then-reconnect. Each test also checks the
  database (`content_text`), so an edit that only survived in the browser fails.

## How they run

1. `auth.setup.ts` creates the confirmed user `e2e-user@test.local` with the service role key,
   signs in once (with Cloudflare's always-pass captcha token), and saves the session to
   `e2e/.auth/user.json` (ignored by git).
2. Each test seeds its own object with the service role, so tests never share state.
3. The app is a production build served by `vite preview` on port 4173. The service worker is
   active, as in production.

## Running them on a machine with a local stack

```sh
supabase start
# From `supabase status -o env`:
export VITE_SUPABASE_URL=http://127.0.0.1:54321
export VITE_SUPABASE_ANON_KEY=<ANON_KEY>
export SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
export VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
npm run build
npx playwright install chromium
npm run test:e2e
```

Never point these variables at production: the setup creates a user and the tests write objects.
