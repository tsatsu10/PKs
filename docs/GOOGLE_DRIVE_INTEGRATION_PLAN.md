# Google Drive Integration Plan — PKS

## Overview

Add Google Drive as a **backup destination** for user knowledge objects. Users connect their Google account via OAuth, then can run manual or scheduled backups to Drive. Supabase remains the source of truth.

---

## Phase 1: Google Cloud Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com) (or use existing).
2. Enable the **Google Drive API**.
3. Configure **OAuth consent screen** (External for production; Test for dev).
4. Create **OAuth 2.0 credentials** (Web application type).
5. Add authorized redirect URIs:
   - Dev: `http://localhost:5173/auth/google/callback` (or your dev URL)
   - Prod: `https://your-domain.com/auth/google/callback`
6. Store **Client ID** and **Client Secret** in Supabase secrets / `.env` (server-side only, never expose in frontend).

**Required scopes:**
- `https://www.googleapis.com/auth/drive.file` — access only files created by the app
- Optionally: `https://www.googleapis.com/auth/drive.appdata` for app-specific storage

---

## Phase 2: Backend — OAuth & Token Storage

### 2.1 Supabase Edge Function: `google-auth`

- **Endpoint:** `POST /functions/v1/google-auth` with query param `?action=redirect` or `?action=callback`
- **Redirect action:** Build Google OAuth URL, return redirect response.
- **Callback action:** Exchange `code` for tokens, store in `integrations` table:
  - `type: 'google_drive'`
  - `config: { access_token, refresh_token, expires_at, folder_id? }`
- Associate with current user via `auth.uid()`.

### 2.2 Supabase Edge Function: `google-drive-refresh`

- Accepts integration id or user id.
- Loads stored tokens from `integrations`.
- Refreshes `access_token` using `refresh_token`.
- Updates `integrations.config` with new tokens.
- Returns refreshed `access_token` for use in backup.

### 2.3 Database

- Use existing `integrations` table.
- Create row with `type = 'google_drive'`, `config` containing tokens and optional `folder_id`.

---

## Phase 3: Backend — Backup Logic

### 3.1 Supabase Edge Function: `google-drive-backup`

- **Input:** `user_id`, optional `object_ids` (single object or full backup).
- **Flow:**
  1. Load user's `google_drive` integration; refresh token if expired.
  2. Ensure a root backup folder exists (e.g. "PKS Backup"); create if not, store `folder_id` in `config`.
  3. For each object:
     - Load object + domains, tags, links (same structure as export).
     - Build JSON (or Markdown) payload.
     - Upload to Drive via `files.create` or `files.update` if file exists (e.g. `{object_id}.json`).
  4. Optional: trigger `deliverWebhookEvent` / audit log for backup completion.

### 3.2 File Structure on Drive

```
PKS Backup/
├── metadata.json          # backup timestamp, user info
└── objects/
    ├── {object_id_1}.json
    ├── {object_id_2}.json
    └── ...
```

**Object JSON format:**
```json
{
  "id": "uuid",
  "type": "note",
  "title": "...",
  "summary": "...",
  "content": "...",
  "key_points": [],
  "domains": ["..."],
  "tags": ["..."],
  "updated_at": "ISO8601"
}
```

---

## Phase 4: Frontend — Connect & Backup UI

### 4.1 Integrations Page

- Add "Google Drive" card in [Integrations.jsx](frontend/src/pages/Integrations.jsx).
- **Connect:** Button that redirects to `google-auth?action=redirect`.
- **Status:** Show connected/disconnected; optionally last backup time.
- **Disconnect:** Delete or disable integration; optionally revoke token.

### 4.2 Settings or Integrations

- "Backup to Google Drive" button.
- Calls Edge Function `google-drive-backup` (full backup).
- Show loading state and success/error toast.

### 4.3 Object Detail (Optional)

- Export panel: add "Save to Google Drive" for current object.
- Calls `google-drive-backup` with `object_ids: [id]`.

---

## Phase 5: Scheduled Backups (Optional)

- Use Supabase cron (or external scheduler) to call `google-drive-backup` for users with `google_drive` integration enabled.
- Run daily or weekly.
- Consider adding `config.backup_schedule: 'daily' | 'weekly' | 'manual'` to integration.

---

## Phase 6: Security & Edge Cases

- **Tokens:** Never expose client secret; OAuth flow runs only in Edge Functions.
- **Refresh:** Refresh access token before each Drive API call if near expiry.
- **Errors:** Handle Drive API rate limits, 401/403, network failures with retries.
- **Revocation:** If user revokes access, handle gracefully and clear integration.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `supabase/functions/google-auth/index.ts` | Create — OAuth redirect + callback |
| `supabase/functions/google-drive-refresh/index.ts` | Create — token refresh |
| `supabase/functions/google-drive-backup/index.ts` | Create — backup logic |
| [frontend/src/pages/Integrations.jsx](frontend/src/pages/Integrations.jsx) | Modify — add Google Drive card |
| `frontend/src/lib/googleDrive.js` | Create — helpers for connect, backup, status |
| `supabase/config.toml` or cron config | Modify — optional scheduled backup |

---

## Environment Variables (Supabase Secrets)

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-app.com/auth/google/callback
```

---

## Testing Checklist

- [ ] Connect Google account via OAuth
- [ ] Full backup of all objects
- [ ] Single-object backup
- [ ] Token refresh when expired
- [ ] Disconnect / revoke
- [ ] Error handling (network, Drive API errors, invalid token)

---

## Future Enhancements

- **Import from Drive:** Read backup files from Drive and sync/import back into PKS.
- **Primary storage:** Use Drive as primary content store, Supabase for metadata/search.
- **Attachments:** Upload object attachments to Drive and link them.
