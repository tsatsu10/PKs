# PKS — Architecture & Best Practices

This document describes system design and coding practices used in the codebase and recommendations for consistency.

---

## 1. System design

### 1.1 High-level architecture

- **Frontend**: React (Vite) SPA; auth and data via Supabase client (JWT, RLS).
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions). No separate app server; business rules live in DB (RLS, triggers, RPCs) and Edge Functions.
- **Auth**: Supabase Auth (email/password). Session JWT is sent with every Supabase request; RLS enforces per-user access.

### 1.2 Data access and security

- **RLS (Row Level Security)** is enabled on all user-scoped tables. Policies express “user sees only own rows” or “owner + shared users” (e.g. `knowledge_objects`, `share_permissions`).
- **Edge Functions** (`run-prompt`, `webhook-deliver`) verify the Supabase JWT via `supabase.auth.getUser(token)` and use the service role or anon key only for server-side DB access; they do not trust client input beyond validation.
- **Secrets** (e.g. `OPENAI_API_KEY`) are set in Supabase Project Settings → Edge Functions → Secrets, not in the frontend.

### 1.3 Consistency and single source of truth

- **Constants**: Shared enums and event names live in `frontend/src/constants/index.js` (e.g. `OBJECT_TYPES`, `WEBHOOK_EVENTS`, `AUDIT_ACTIONS`). Use these instead of duplicating magic strings across pages.
- **Types**: Knowledge object types align with the DB enum `knowledge_object_type`; webhook event ids align with what `webhook-deliver` expects.

---

## 2. Frontend structure

### 2.1 Directory layout

- **`context/`** — React context (e.g. `AuthContext`).
- **`components/`** — Reusable UI and layout (e.g. `ProtectedRoute`, `NotificationCenter`, `ErrorBoundary`).
- **`pages/`** — Route-level components; one folder per page with optional co-located CSS.
- **`lib/`** — Non-React helpers (Supabase client, audit, notifications, webhooks, imports).
- **`constants/`** — Shared constants used across the app.

### 2.2 Routing

- Routes are defined in **`routes.jsx`** (`routeConfig`). `App.jsx` maps over them so adding or changing routes is done in one place.
- Protected routes are wrapped in `ProtectedRoute`, which shows a loading state until auth is ready and redirects unauthenticated users to `/login`.

### 2.3 Error handling

- **ErrorBoundary** wraps the app and catches React render errors so one failing component does not unmount the whole tree. Errors are logged; user sees a fallback and can retry.
- **Async errors** (Supabase, Edge Functions) are handled locally (e.g. `setError`, toast) and optionally logged. Failed audit/notification/webhook calls use `console.warn` and do not block the user flow.

---

## 3. Coding practices

### 3.1 State and data fetching

- **Auth**: Global auth state lives in `AuthContext`; `user` and `loading` are consumed via `useAuth()`.
- **Server state**: Fetched in `useEffect` with a `cancelled` flag to avoid setState after unmount; dependency arrays include the relevant ids (e.g. `[id, user?.id]`).
- **Forms**: Local state (e.g. `useState`) for controlled inputs; submit handlers call Supabase and then update state or navigate.

### 3.2 Naming and style

- **Components**: PascalCase. **Files**: PascalCase for components (`ObjectDetail.jsx`), camelCase for lib/helpers (`supabase.js`).
- **Constants**: UPPER_SNAKE_CASE for primitives/arrays; use shared constants instead of inline strings for types and event names.
- **Handlers**: Prefix with `handle` (e.g. `handleSave`, `handleSubmit`).

### 3.3 Supabase usage

- **Single client**: Supabase client is created once in `lib/supabase.js` and reused (singleton). Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required at build/runtime.
- **Auth for Edge Functions**: When invoking Edge Functions, the Supabase client automatically sends the session JWT. No need to attach it manually for `invoke()`.

### 3.4 Audit, notifications, webhooks

- **Audit**: After a successful sensitive action (create/update/delete object, prompt run, export), call `logAudit(userId, action, entityType, entityId, payload)` from `lib/audit.js`. Use `AUDIT_ACTIONS` and `AUDIT_ENTITY_TYPES` from constants when applicable.
- **Notifications**: Use `createNotification(userId, type, title, body, related)` from `lib/notifications.js` for user-visible feedback (e.g. export completed).
- **Webhooks**: Use `deliverWebhookEvent(event, payload)` from `lib/webhooks.js` for fire-and-forget delivery; event ids should match `WEBHOOK_EVENTS` in constants.

---

## 4. Database and migrations

- **Migrations** are versioned under `supabase/migrations/`. Apply with `supabase db push` or via the Supabase dashboard.
- **Policies**: Prefer one policy per (table, operation) where possible; document any `SECURITY DEFINER` function (e.g. `resolve_user_id_by_email`).
- **Indexes**: Add indexes for foreign keys and columns used in filters/sorts (e.g. `user_id`, `updated_at`, `knowledge_object_id`).

---

## 5. What to avoid

- **No secrets in frontend**: Do not put API keys or secrets in `.env` that are exposed to the browser (Vite exposes `VITE_*` to the client). Use Edge Functions and Supabase secrets for server-side keys.
- **No bypassing RLS**: Do not use the service role key in the frontend. All client-side access should use the anon key and rely on RLS.
- **Avoid duplicate constants**: Use `constants/index.js` for object types, webhook events, and audit action/entity types instead of redefining them in multiple files.
- **Avoid setState after unmount**: Use a `cancelled` flag in async `useEffect` and check it before calling setState.

---

## 6. Optional improvements

- **Lazy loading**: Route-level `React.lazy()` + `Suspense` can reduce initial bundle size; consider for heavy pages if metrics show a benefit.
- **Centralized API layer**: If a custom backend is added, keep a single module (e.g. `lib/api.js`) that attaches the Supabase JWT and handles errors.
- **Tests**: Add unit tests for lib helpers (audit, notifications, webhooks) and integration/E2E tests for critical flows (login, create object, export).
- **Accessibility**: Ensure forms have labels, buttons have clear purposes, and error messages are associated with inputs (e.g. `aria-describedby`).
