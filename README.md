# PKS: Personal Knowledge System

A personal knowledge base: typed knowledge objects, domains and tags, links, full-text search, prompts (DeepSeek and Claude), templates, sharing and export. React 19 + Vite frontend on Supabase (Postgres, Auth, Storage, Edge Functions).

## Layout

| Path | What |
|---|---|
| `frontend/` | React app (Vite). Deployed to Vercel (`frontend/vercel.json`). |
| `supabase/migrations/` | Postgres schema, RLS policies and RPCs |
| `supabase/functions/` | Edge functions: `run-prompt`, `webhook-deliver` |
| `docs/plans/` | Roadmap and codebase audit |
| `docs/superpowers/plans/` | Task-by-task implementation plans |

## Frontend setup

```bash
cd frontend
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` | Production build + service worker |
| `npm run check:bundle` | Verifies the editor chunk stays off non-editor pages (run after build) |

## Deploying

`npm run build` output goes to Vercel. After the first deploy of the prompt-mode service worker, users on the old build get the update only once they close every PKS tab or installed window — the new worker can't take over a page it doesn't control. From then on, the app shows a "New version available · Reload" bar when an update is ready, and long-open tabs check for updates hourly (and whenever the tab regains focus).

## Edge function secrets

Copy `supabase/functions/.env.example` to `supabase/functions/.env` for local runs (`supabase functions serve --env-file supabase/functions/.env`). Set the same names in the hosted project with `supabase secrets set`.
