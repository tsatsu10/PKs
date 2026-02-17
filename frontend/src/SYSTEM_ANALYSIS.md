# PKS Frontend — System Analysis: Interoperability & Isolation

## Shared / interoperable modules

These are **single sources of truth** and must stay consistent with the backend (Supabase enums, RLS, Edge Functions).

| Module | Purpose | Used by |
|--------|---------|---------|
| **lib/supabase.js** | Supabase client singleton (auth, DB, storage, functions) | All pages, lib/audit, lib/notifications, lib/webhooks, lib/imports |
| **lib/audit.js** | `logAudit(userId, action, entityType, entityId?, payload?)` | ObjectDetail, ObjectNew, QuickCapture, Dashboard |
| **lib/notifications.js** | `createNotification(userId, type, title, body?, related?)` | ObjectDetail, Dashboard |
| **lib/webhooks.js** | `deliverWebhookEvent(event, payload)` — invokes `webhook-deliver` Edge Function | ObjectDetail, ObjectNew, QuickCapture |
| **lib/export.js** | `getExportIncludeFromTemplate(template, { includeLinks })`, `buildObjectMarkdown(obj, include, opts)`, `EXPORT_TEMPLATE_IDS`, `EXPORT_FORMAT_LABELS` | ObjectDetail (single export), Dashboard (bundle export) |
| **lib/storage.js** | `FILES_BUCKET`, `getStoragePath(userId, fileId, filename)` | ObjectDetail (upload/download) |
| **constants/index.js** | `OBJECT_TYPES`, `OBJECT_TYPE_ICONS`, `WEBHOOK_EVENTS`, `AUDIT_ACTIONS`, `AUDIT_ENTITY_TYPES`, `AUDIT_ACTION_LIST` | Pages, AuditLogs filter |

**Rules:**

- Audit actions and entity types must use `AUDIT_ACTIONS` and `AUDIT_ENTITY_TYPES` so they stay in sync with `audit_logs` and filters.
- Export template presets live only in `lib/export.js`; ObjectDetail and Dashboard both use `getExportIncludeFromTemplate`.
- File storage path and bucket name live only in `lib/storage.js` so RLS and future file features stay consistent.

---

## Isolated modules (no cross-use)

These are **feature-specific** or **optional**; nothing else should depend on them for core flows.

| Module | Purpose | Intended use |
|--------|---------|--------------|
| **lib/api.js** | `getAuthHeaders()`, `apiFetch(path, options)` for a **future custom backend** (VITE_API_URL) | Not used by current app. All data goes through Supabase. Use only when you add a separate API server. |
| **lib/imports.js** | `getExistingObjectForImport()`, `registerImport()` — import deduplication RPCs | Only for import flows (e.g. Integrations → import pipeline). Not used by ObjectDetail/Dashboard/ObjectNew/QuickCapture. |

**Rules:**

- Do **not** import `lib/api.js` for Supabase or auth; use `lib/supabase.js` and AuthContext.
- Do **not** import `lib/imports.js` from general CRUD or export flows; keep it for integration/import-only code.

---

## Backend (Supabase) boundaries

| Layer | Role | Isolation |
|-------|------|-----------|
| **RLS (Row Level Security)** | Per-table policies; users see only their own (or shared) rows | Enforced in DB; frontend never bypasses. |
| **Edge Functions** | `run-prompt` (OpenAI), `webhook-deliver` (outbound HTTP) | Invoked by frontend via `supabase.functions.invoke()`. They do not call each other. |
| **RPCs** | `search_knowledge_objects`, `suggest_tags_for_object`, `suggest_tags_for_object_fallback`, `suggest_linked_objects`, `resolve_user_id_by_email`, etc. | Defined in migrations; frontend calls by name. Names and signatures must match. |

---

## Page-level responsibilities

- **ObjectDetail**: Single-object CRUD, domains/tags/links/files, run prompt, **single-object export** (TXT/MD/HTML/JSON/DOCX/PDF). Uses lib/export (presets), lib/storage (path/bucket), constants (audit/entity types).
- **Dashboard**: Search, filters, list/card view, **multi-object export** (ZIP). Uses lib/export (presets + buildObjectMarkdown), lib/audit, lib/notifications, constants (audit/entity types).
- **ObjectNew / QuickCapture**: Create object; audit + webhook only. Use constants for audit action/entity.
- **AuditLogs**: List/filter audit entries. Uses `AUDIT_ACTION_LIST` for the filter dropdown.
- **Integrations**: Config UI; future import flow can use lib/imports without touching other pages.

---

## Adding a new feature

1. **Shared behavior** (e.g. new export format, new audit action): add to `lib/export.js`, `constants/index.js`, or a new `lib/*.js` and use from all call sites.
2. **Optional / integration-only**: keep in a dedicated module (e.g. `lib/imports.js`) and import only from the feature that needs it.
3. **Backend**: add RPC or table in a migration; keep frontend RPC/table names in sync.
