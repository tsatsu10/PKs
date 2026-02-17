# PKS — Personal Knowledge System

**Second Brain for African Tech & Health Professionals**

Uses **Supabase** for auth and database.

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- npm or yarn

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com) (or use Supabase CLI).
2. Apply migrations either:
   - **CLI**: From project root run `supabase link` (one-time), then `supabase db push`
   - **Manual**: Run each file in `supabase/migrations/` in order (oldest first) in the Supabase **SQL Editor**
3. **Check DB is up to date**: Run `supabase/verify_db_up_to_date.sql` in the SQL Editor, or see **docs/DATABASE_UP_TO_DATE.md**
4. In **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

### 2. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Edit .env and set:
#   VITE_SUPABASE_URL=https://xxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-key
npm install
npm run dev
```

Frontend runs on http://localhost:5173

### 3. Test

1. Open http://localhost:5173
2. Click **Register** and create an account (email + password)
3. You should land on the Dashboard
4. Sign out and sign back in

No separate backend is required for Phase 1; auth and the `users` table live in Supabase.

## Project Structure

```
knowledge/
├── frontend/          # React + Vite + Supabase client
│   └── src/
│       ├── components/
│       ├── context/   # AuthContext (Supabase auth)
│       ├── lib/      # supabase.js, api.js
│       └── pages/
├── supabase/
│   └── migrations/   # SQL migrations (run in Supabase)
├── backend/          # Optional for later phases (exports, jobs, etc.)
├── PKS_Master_Plan_And_Requirements.txt
└── PKS_Full_Product_Plan.txt
```

## Phase 1 Status (Supabase)

- [x] Project setup (frontend)
- [x] Supabase client + env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [x] Auth: register, login, logout (Supabase Auth)
- [x] public.users table + RLS + trigger (profile on signup)
- [x] Protected routes (redirect to login)
- [x] Base layout (Dashboard)

## Optional: Backend

The `backend/` folder is kept for future phases (e.g. export jobs, prompt execution, file processing). For Phase 1, the app uses only Supabase. When you add the backend again, you can verify Supabase JWTs with the Supabase project JWT secret.

## Next: Phase 2

Knowledge Object CRUD + Versioning (tables in Supabase, frontend or backend API).
