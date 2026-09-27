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

## Edge function secrets

Copy `supabase/functions/.env.example` to `supabase/functions/.env` for local runs (`supabase functions serve --env-file supabase/functions/.env`). Set the same names in the hosted project with `supabase secrets set`.
