# PKS: UI/UX Design Requirements

_Date: 2026-10-13 · For: UI/UX designer · Sources: [roadmap](../plans/2026-09-26-ultimate-knowledge-base-roadmap.md), [codebase audit](../plans/2026-09-26-codebase-audit.md), [Phase 0a spec](../superpowers/specs/2026-10-13-phase-0a-part1-data-layer-design.md), and the current app (`frontend/src`)._

This brief lists every screen, flow and component we want designed, now and on the roadmap. It says **what** each part must do and which states it needs. It leaves the visual answer to you. Items are tagged with the roadmap phase they ship in, so you can design the early ones first.

---

## 1. The product

**PKS (Personal Knowledge System)** is a personal knowledge base on the web, installable as an app (PWA). People save notes and other typed "objects", organise them with domains and tags, link them together, search them, and run AI over them.

**North star:** _"Capture in 2 seconds, find anything in 200 ms, see how it connects, and ask it questions with cited answers."_

**Who it's for:** individuals building a long-lived second brain: knowledge workers, researchers, engineers, writers. Signup is open. Sharing exists (owner, editor and viewer roles); team features come later.

**What competitors get wrong, and what we must avoid:**

| Failure | Seen in | What it means for the design |
|---|---|---|
| Onboarding cliff | Tana | A new user sees a note, a search box and Today. Nothing else until they need it. |
| Slow at scale | Notion, Heptabase | Layouts must work with 10,000 objects: virtualised lists, no layout that depends on loading everything. |
| Weak exact-keyword search | Mem | Exact title matches always come first; show why a result matched. |
| Poor offline | Notion | Offline is a normal state with clear messaging, not an error. |

---

## 2. Design principles (apply to every screen)

1. **Keyboard-first, mouse-friendly.** Every action is reachable from the command palette (Ctrl+K). Tooltips show the shortcut. Keyboard hints are hidden on touch devices.
2. **Progressive disclosure.** A plain note never shows empty property fields. Advanced features appear when relevant.
3. **Never lose work.** Autosave, retry, version history with a diff view. Use **undo toasts instead of confirm dialogs** for reversible actions. Ask before discarding unsaved changes.
4. **Skeletons, not spinners.** Keep previous results visible while new ones load; don't flash a skeleton on every filter change or lose scroll position.
5. **AI suggests, the human decides.** AI output always cites its sources, is labelled as AI-generated, and never changes data without the user accepting it.
6. **Mobile is first-class.** Fixed UI clears the bottom nav and safe areas. Inputs are 16 px (no iOS zoom). Touch targets ≥ 24 px, 44 px on touch screens.
7. **Accessible.** WCAG 2.2 AA in both light and dark themes. Visible focus rings. Never use colour alone to show state.
8. **Fast-feeling.** Animations under 100 ms, and `prefers-reduced-motion` is respected.
9. **Plain language.** No jargon, no raw database values, one name per thing (see the glossary in §8).

---

## 3. Current state: keep, change, drop

### Visual identity today
- Dark-first "space" theme with a light theme. Inspired by a Behance "Meeting Assistant" concept: Space Black, Polar White, Cosmic Pink (`#ec4899`), Midnight Purple (`#6366f1`), glass panels, pink→purple gradient.
- Font: Plus Jakarta Sans (to be self-hosted).
- Tokens live in `frontend/src/index.css`.

You may evolve this identity. Whatever you choose must fix these known problems:
- Primary button text fails contrast in both themes; hint, success and danger colours fail contrast.
- The dashboard focus ring is almost invisible.
- Some tokens are referenced but never defined.
- About 4,000 lines of one-off CSS: 12 card variants, 23 page-specific button styles, 11 overlay implementations, 36 empty-state styles. **We want one component library** (§7).
- Icons are emoji and Unicode glyphs today; we are moving to **Lucide**.

### Being removed (don't design these)
- Pulse rings, streak celebrations, targets and sparklines on the dashboard.
- The radial "menu wheel" navigation.
- The About page (becomes a Help entry in the palette).
- The slug URL route.
- Export job tracking.
- The second command palette, the dashboard quick-add form, and the separate Search page's own search box (all merged into one palette, see §5).
- The "generic" integration type (webhooks stay).

### Being merged
| Today | Becomes |
|---|---|
| Ctrl+K palette, dashboard palette, Search page, `/` command bar, link search | **One command palette** |
| Quick Capture page, dashboard quick-add, floating "+" button, New Object | **One global capture modal** that lands in the **Inbox** |
| Journal (plain textarea calendar) | **Daily notes**: normal objects of type "daily" |
| Paste Bin | **Snippets**: normal objects of type "snippet" |
| Templates page | **Object types with properties** |
| Dashboard trailheads, trending tags, recent links | **Home** widgets |
| Notifications page + bell | One notification centre, live-updating |

---

## 4. Information architecture

### Proposed navigation

**Primary (sidebar on desktop, bottom nav on mobile):**
- **Home**
- **Search** (opens the palette or the full search page; the mobile bottom nav must include Search, which it lacks today)
- **Inbox** (unprocessed captures, with a count)
- **Today** (today's daily note)
- **Ask** (AI chat over the knowledge base) — Phase 4
- **Saved views** pinned by the user — Phase 5

**Secondary (sidebar group, or under "More" on mobile):**
- Domains & tags
- Prompts
- Shared with me — Phase 6
- Trash (missing from navigation today; must be reachable)
- Import / Export
- Settings (with Integrations, Activity log, AI keys and usage as sections)

**Global, always available:** command palette (Ctrl+K), quick capture (Ctrl+Shift+Q), Ask (Ctrl+J), notification bell, account menu, shortcuts help (`?`).

Please propose the final grouping. Constraints: the sidebar and palette share one navigation list; the sidebar can collapse to icons on desktop; the mobile drawer always shows labels.

### Core concepts the UI must make clear

| Concept | Meaning |
|---|---|
| **Object** | Any saved item. Has a title, rich-text content, a type, a status, optional due and reminder dates, a cover image, attachments, version history and links. |
| **Type** | What kind of object it is (§6). Drives the icon/colour mark and, later, which properties show. |
| **Status** | Draft, Active, Archived. |
| **Domain** | A broad area ("Work", "Health"). Later nested, with colour and icon. |
| **Tag** | A free label. |
| **Link** | A connection between two objects. Either written inline as `[[Title]]` or added manually. Shown both ways (backlinks). |
| **Inbox** | Captures not yet sorted. |
| **Saved view** | A filter plus a layout (table, board, calendar, gallery), saved and pinnable. |
| **Prompt** | A reusable AI instruction run against one or more objects. |

---

## 5. Screens and flows

Each item lists what it must do and the states to design. Every data screen needs: **loading (skeleton), empty, error with Retry, offline (showing saved data), and populated**. Errors appear inline next to what failed, not at the top of the page.

### 5.1 App shell (global) — Phase 0a/0b

- Sidebar (expanded/collapsed), top bar, mobile bottom nav and mobile drawer.
- **Offline banner:** "You're offline. Showing saved data." then a brief "Back online".
- **Update bar:** "New version available · Reload". Must not interrupt someone mid-edit.
- **Toasts:** success, info, error, and **undo** ("Moved to Trash · Undo"). Error toasts stay until dismissed and can be paused.
- **Notification centre:** bell with unread count, panel with list, mark read, mark all read. Proper focus handling. Only one bell on screen (the object page shows a second one today).
- **Shortcuts help** (`?`): lists all shortcuts, grouped. Must not trigger while typing in the editor.
- **Route error screen:** "Something went wrong" with Reload. A separate screen for "the app couldn't load its configuration".
- **Forced update screen:** when a release can't work with an old open tab, the app must reload. Explain why, and save any unsaved edit first.
- **Unsaved-changes guard:** leaving a page with unsaved edits asks before discarding.
- Page titles and focus move to the page heading on navigation; every page has one H1.

### 5.2 Sign in, sign up, onboarding — Phase −1B, 3

- Login, Register, Forgot password, Reset password.
- **CAPTCHA** (Cloudflare Turnstile) on Register, Login, Forgot password and password change in Settings. Design where the widget sits, and the "Check expired or blocked: try again" state.
- **Email confirmation** step: "Check your inbox" screen, resend link, confirmed state.
- **Onboarding (Phase 3):**
  - A sample linked "Getting Started" domain created for new users.
  - **One** empty-state call to action on Home (today there are 5 competing ones and 3 ways to create).
  - A 3-step checklist: **Capture → Link → Ask**. Dismissible; shows progress.
  - Target: a new user makes their first linked object in under 3 minutes.

### 5.3 Home — Phase 0a (light touch), Phase 5 (full redesign)

Replaces today's dashboard. Design the Phase 5 version; it should degrade gracefully before saved views exist.
- Widgets: **Pinned objects**, **Recently viewed** (today's "Resume where you left off"), **Recent activity**, **Due** (overdue / today / soon, with text labels, not colour only), **Trending** (tags/objects), **Inbox count**, **Review card** (§5.12), **Today's note**.
- Pinned saved views below or beside the widgets.
- Object cards/rows: type mark, title, summary, domain, tags, status, due date, pinned, link count, "Shared" badge. The whole card is clickable via a title link; checkboxes and tag links inside must not be nested in another link.
- Bulk select (checkboxes always visible on touch devices) with a bulk action bar: add tag, set domain, change status, export, move to Trash. The bar must clear the mobile bottom nav.
- Density options (comfortable/compact) — give them plain names.

### 5.4 Command palette (Ctrl+K) — Phase 1

One palette replaces five search surfaces.
- Fuzzy-matches object titles, actions/commands, recent items, domains and tags.
- **Prefix modes:** `>` commands, `#` tags, `@` domains. Show the active mode as a chip.
- Sections: Recent, Objects, Commands, Tags/Domains, Help.
- Each result shows type mark, title, a snippet with the matched words highlighted, and domain.
- Footer with key hints (↑↓ to move, Enter to open, Ctrl+Enter to open in new tab, Esc to close).
- States: empty query (recents + suggested actions), typing, no results ("Create '<query>'" action), offline (searches cached items only, says so).
- Mobile: full-screen sheet.

### 5.5 Search page — Phase 1, Phase 4 (hybrid)

For deeper search than the palette.
- Query box, **result count**, **filter chips** (type, domain, tag, status, date, has attachments, shared), sort (relevance, updated, created).
- Results with snippets, dates and match highlights; keyboard navigation.
- Toggle to include **attachment text** (PDF, DOCX, TXT, MD content).
- **Saved searches.**
- Filters apply instantly (no "Apply" button); previous results stay visible while loading.
- Phase 4: **keyword results render first, then semantic (AI) results merge in.** Design how late-arriving results appear without jumping the list, and a small marker for "matched by meaning".
- "Enter a query" must not show when filters are set.

### 5.6 Quick capture (Ctrl+Shift+Q) — Phase 3

The most important flow: hotkey → saved in under 2 seconds.
- A modal reachable from anywhere (plus a mobile entry point that replaces the floating button).
- Title optional; content optional; **one** of them required.
- Inline `#tag` and `@domain` with autocomplete; **create new tags/domains inline**.
- Paste an image or URL (URL becomes a bookmark with title preview).
- "Capture another" toggle that keeps the modal open.
- Lands in the **Inbox**. Confirmation is a toast with "Open".
- Also design: **share target** (sharing from another app on Android/desktop), **web clipper/bookmarklet** result page, **email-in** address shown in Settings, optional **voice capture**.

### 5.7 Inbox — Phase 3, AI suggestions Phase 4

- List of untriaged captures, newest first, with a count in the nav.
- **Keyboard-first triage:** for each item, set type, domain, tags, link to something, or archive/trash, then move to the next. Show the shortcuts.
- Phase 4: **AI suggestions** for type, domain, tags and links, shown as chips the user accepts or dismisses one by one. Never applied automatically.
- Empty state: "Inbox zero".

### 5.8 Object page — Phase 0a (split + autosave), 2 (links), 4 (AI), 5 (properties)

The core screen. Today it is one 1,550-line page with duplicated controls; it will be split into panels. Design it as a layout of these parts:

**Header**
- Breadcrumbs, type mark, editable title, short **summary**, status, domain, tags, **aliases** (other names the object can be linked by; Phase 2).
- **Save indicator:** "Saved ✓", "Saving…", "Not saved: retrying". Plus "Offline: changes saved on this device".
- **Conflict state:** when someone (or another tab) changed the object since you opened it, show a clear choice: see both versions side by side, keep yours, or take theirs. Also used when a saved draft on this device is older than the server version. Never overwrite silently.
- Actions: Pin/Unpin, Share, Export, Run prompt, Version history, Move to Trash, more (⋯). On mobile these collapse into a ⋯ menu and the header is not sticky (today it is ~200 px tall and hides fields).
- Cover image (fixed aspect ratio, no layout shift, hidden if it fails to load).
- "Shared by <name>" badge and the viewer's role (Owner / Editor / Viewer). Viewers get a read-only page; editors can edit content but not domains, tags or links (hide those controls rather than showing broken ones).

**Editor** (BlockNote block editor)
- Rich text blocks, slash menu, images (upload/paste/drag) — Phase 3.
- **`[[` link menu** (Phase 2): searches titles and aliases, "Create '<title>'" as the last option. A link must take ≤ 3 keystrokes after `[[`. Inline links render as chips/styled text; links to trashed objects look different.
- **`@` mentions** for person objects.
- Autosave, no Save button. An explicit "Save version" exists in history.

**Properties** (Phase 5)
- Per-type fields (text, number, date, select, multi-select, checkbox, URL, relation…).
- Hidden when empty on plain notes; "+ Add property".
- Due date and reminder pickers that respect the user's timezone.

**Backlinks & connections** (Phase 2)
- Incoming links, each with the sentence around it.
- **Unlinked mentions**: places where this object's title appears without a link, with a one-click "Link".
- Outgoing links; manual "Add link" via one search combobox (not a 50-item dropdown) with confirmation feedback.
- **Local graph:** 1–2 hops, small panel, with a full-screen explore mode. No giant global graph by default.
- **Related notes** and **suggested links** (AI, Phase 4), each accepted or dismissed by the user.

**AI summary & key points** (Phase 4/5)
- "Summarize" fills the summary; key points are stored as a property. Both are shown as suggestions to accept, edit or reject, and marked as AI-written.

**Attachments**
- List with name, size, type, download, remove (with undo). Upload with progress, size/type limits and error states.
- Extracted text available to search (indicate "searchable").

**Version history**
- List of versions (who, when). Select one to see a **diff** against current. Restore (with undo).
- Viewers may not see history from before they were given access.

**AI panel** (Phase 4: run-prompt v2)
- Pick a prompt (or write one), choose context (this object, plus more objects via picker), choose provider/model where allowed.
- **Streaming output**, clearly labelled as AI-generated and untrusted.
- Show **which provider and model actually ran** (runs on the app's shared key use Claude Sonnet; runs on the user's own key use Claude Opus; DeepSeek is also available). Show when the input was cut short because it was too long, how much of today's quota is left, and the "daily limit reached" state (per user, per provider, and app-wide). Errors in plain language (no "Edge Function secrets").
- Actions on output: **Append to note**, **Save as new linked object**, Copy, Discard (asks first; output costs money).
- Clickable **run history**.
- Must be a proper dialog/panel: Escape, focus trap, labels; a backdrop click must not discard output.

**Share panel**
- Invite by email with a role (Viewer/Editor). The confirmation is **the same whether or not that email has an account** ("Invite sent"), so the UI must never say "user not found". Access starts once the person has a confirmed account; show **pending invites** separately from people who have access. Rate-limit message ("Too many shares in the last hour").
- List of people with access, change role, revoke (with undo).
- Phase 6: **public read-only link** toggle with copy button.

**Export panel**
- Markdown, HTML, PDF (print), DOCX, JSON. Success shown only after it actually works.

### 5.9 Object types & templates — Phase 1/5

- A management screen for types: name, icon, colour mark, property schema (add/reorder/edit fields, field types, select options). Replaces the Templates page.
- Adding a property type must not need a redesign: design the property editor generically.
- Select-option entry must allow commas and typing freely (a bug today).

### 5.10 Saved views — Phase 5

- Layouts: **List/Stream** (grouped by date, as the dashboard does today), **Timeline**, **Table, Board (kanban by status or any select property), Calendar (by due/date property), Gallery (cover images)**.
- Filter builder, sort, group by, visible columns.
- Save, rename, pin to sidebar, embed a view inside an object page.
- Table must render 1,000 rows smoothly (virtualised); inline editing of cells.
- Shareable via URL (filters live in the URL).

### 5.11 Daily notes & snippets — Phase 3

- **Today / Daily notes:** opens today's note (created on first open). Calendar or date strip to jump to other days, with dots for days that have notes. Previous/next day. Must warn before leaving with unsaved text (a data-loss bug today).
- **Snippets:** objects of type "snippet" for code or text. Code blocks with language, copy button. A filtered list view rather than a separate app.

### 5.12 Reminders & review — Phase 5

- Reminders fire as Web Push (installed PWA) and/or an email digest. Design the notification content, the permission prompt (asked in context, not on first load) and settings.
- **Daily Review card:** resurfaces a few objects (spaced-repetition style). Actions: Open, "Remind me later", "Got it", Skip. Optional **flashcards** mode.

### 5.13 Ask your knowledge base (Ctrl+J) — Phase 4

- A chat panel/page that answers from the user's own objects.
- **Streaming answers with citation chips** after each claim. Clicking a chip opens the object and scrolls to and highlights the exact passage.
- "Sources" list under each answer.
- Save an answer as a linked **insight** object.
- Scope control (all my objects / a domain / selected objects). Objects marked **"Exclude from AI"** are never used; show that flag on objects.
- States: thinking, streaming, "I couldn't find this in your notes", quota reached, provider error, offline (disabled).
- **Provider disclosure:** which AI provider processes the data, shown in context and in Settings.

### 5.14 Prompts — exists today, improved in Phase 4

- Prompt library: search, list, create, edit, delete (undo). Each prompt has a name, a "when to use it" description, tags and the prompt text. Deleting a prompt keeps its past runs.
- "Use on object" opens an object picker directly (today it's a dead end).
- Run history per prompt.

### 5.15 Trash — exists, reshaped in Phase 0c

- List of trashed objects with "Deleted <date>" and "Deletes permanently in N days" (30-day default).
- Restore (single and bulk), Delete permanently (this one does need a confirm), Empty trash.
- Paginated; handles more than 1,000 items.

### 5.16 Settings — split in Phase 0b

Today one long page; split into sections with their own navigation:
- **Profile:** name, email, avatar, **timezone picker** (not free text), password change (re-enter current password), delete account.
- **Appearance:** theme (light/dark/system, with text labels, not colour only), density.
- **Domains & tags** together: create, rename, delete (names are unique regardless of capitals: "Work" and "work" clash) (with confirmation showing how many objects are affected), colour/icon, nesting (Phase 5).
- **AI:** your own API keys (DeepSeek, Claude; keys are write-only, show "Key saved · Replace / Remove"), default provider, **usage and limits** (today's usage vs daily caps, per provider), provider disclosure, "exclude from AI" defaults.
- **Capture:** email-in address, bookmarklet install, share-target info.
- **Notifications:** push and email digest preferences.
- **Integrations:** webhooks (§5.18).
- **Activity log** (§5.19).
- **Data:** export everything (JSON backup, Markdown zip), import (§5.17).
- **Help:** shortcuts, what's new, contact. (Remove "contact support" copy unless a channel exists.)

### 5.17 Import & export — Phase 2, 6

- **Import wizard:** choose source (Markdown files, **Obsidian vault zip**, **PKS JSON backup**, later Notion export, HTML/DOCX, Readwise) → upload (size limits shown) → preview (counts, how headings split, how links map) → import with progress → result (imported, skipped duplicates, **failed rows with reasons and a safe retry**).
- A 1,000-note vault with links must import intact.
- **Export:** whole library or selection; ZIP with unique filenames; progress for large libraries.

### 5.18 Integrations (webhooks) — Phase 0c

- Webhook list: URL, events, status, last delivery.
- Create/edit: URL, events (checkbox group with a label), secret (shown once, then write-only).
- **Delivery log:** each attempt with status code, time, retries; "Send test".
- Per-user limit on number of webhooks, with a clear message.

### 5.19 Activity log & notifications pages

- **Activity log:** human-readable entries ("You moved 'X' to Trash", "Ana shared 'Y' with you"), filter by action and date (in the user's timezone), including bulk actions, restores, links and tags. No raw IDs.
- **Notifications page:** full list with filters, mark read. Live updates.

### 5.20 Sharing & collaboration — Phase 6

- **Shared with me** view and a "Shared" badge/filter everywhere objects are listed.
- Accept/decline incoming shares (until then, invites take effect automatically once the email is confirmed).
- **Comments** on objects (threads, resolve, mention).
- **Real-time co-editing** (team mode only): presence avatars, live cursors.
- **Canvas / whiteboard** (tldraw-based) as an object type; block references/transclusion.

### 5.21 Outside the app — Phase 1/6

- **MCP server** (lets outside AI agents such as Claude read and later write the user's knowledge): Settings screen to connect/authorise apps (OAuth consent screen), list connected apps, revoke.

---

## 6. Object types

Each type needs an icon and a colour mark (the "TypeMark") that works in both themes and is distinguishable without colour (icon shape carries the meaning).

Current 21 types: note, document, SOP, report, proposal, guideline, insight, template, concept, tool, incident, case, research paper, decision, prompt, bookmark, meeting notes, quote, recipe, person, how-to.

Coming: **daily** (daily note), **snippet**. Types become user-manageable in Phase 1/5, so the mark system must also work for custom types (pick from an icon set + colour palette).

---

## 7. Component library (Phase 0b)

Design these as a system in `components/ui/`, with all states (default, hover, focus-visible, active, disabled, loading, error) in both themes, desktop and touch sizes:

- **Actions:** Button (primary, secondary, ghost, danger; sizes), IconButton (always with an accessible label and tooltip), Kbd (shortcut chip).
- **Inputs:** Field (label, hint, error), Input, Textarea, Select, **Combobox** (type to search, arrow keys move without committing, Enter commits; supports "Create '<x>'"), Checkbox, Radio group, Switch, Date/time picker (timezone-aware), Tag input / TaxonomyPicker.
- **Containers:** Card, Panel, Dialog, ConfirmDialog (only for irreversible actions), Sheet (mobile bottom sheet), Popover, Menu, Tabs, Accordion.
- **Feedback:** Toast/Toaster (with Undo action), Banner (offline, update, quota), Inline error with Retry (`QueryError`), Save indicator, Progress bar, Spinner (rare), **Skeletons** matching each list/card layout, EmptyState (icon, one sentence, one action).
- **Data display:** Badge (status, shared, role, AI-generated), TypeMark, Avatar, Object card, Object row, Table (virtualised, sortable, selectable), Pagination / infinite list, Breadcrumbs, Diff view, Citation chip, Snippet with highlighted matches.
- **Navigation:** Sidebar, Bottom nav, Command palette, Filter chips.

Also deliver: tokens (colour, type scale, spacing, radius, elevation, motion), light and dark themes, icon guidance (Lucide), and PWA icons (192/512 PNG + maskable).

---

## 8. Copy & glossary

Use one name per concept everywhere:

| Use | Not |
|---|---|
| Home | Dashboard |
| Notifications | Alerts |
| Prompts | Prompt Bank |
| Object (generic UI) / the type name (specific) | entry, item, note (when you mean any object) |
| Move to Trash | Delete, Soft-delete |
| Filters | More filters |
| Version 3 | v3 |

Also:
- Remove jargon: "rhythm/tend", "Spark", "Synthesize", "Stakeholder", "Comfy", "Field key", "server DeepSeek key".
- Never show raw values ("active", "research_paper", "knowledge_object 1a2b…"); use labels.
- **One date format** everywhere, relative where useful ("2 h ago", "Yesterday"), absolute on hover.
- Error messages in plain language. The app already classifies errors into: offline, network, signed out, no permission, not found, conflict ("changed elsewhere"), invalid input, rate limited, server, unknown. Each needs friendly copy and a next step.
- Buttons name what they act on ("Remove tag 'work'", not "Remove").

---

## 9. Accessibility, mobile and performance requirements

**Accessibility (WCAG 2.2 AA):**
- Text contrast ≥ 4.5:1, large text and UI parts ≥ 3:1, in both themes, including gradients, toasts and status colours.
- Visible focus ring distinct from hover/glow.
- Full keyboard use; dialogs trap focus and close on Escape; closed drawers are not in the tab order.
- Correct roles for lists, menus, comboboxes, grids; virtualised lists announce their size.
- State never by colour alone (overdue vs soon, selected theme, selection).
- Labels on every input; fieldsets for grouped options.

**Mobile (design at 375 px):**
- Bottom nav never covers sheets, action bars or buttons; respect safe areas (notch, home bar).
- Use the full width (today padding wastes ~64 px); avoid nested scroll boxes.
- On the new-object/capture form, properties come before the long editor and the submit button is reachable (sticky).
- Bulk-select checkboxes visible without hover.
- No keyboard hints on touch devices.

**Performance-driven design constraints:**
- Opening a cached object: < 100 ms, so the object page must render from cached data first and fill panels lazily.
- Search p95 < 150 ms (keyword), < 600 ms (with AI results merging in).
- Lists of 1,000+ items are virtualised; design rows with fixed or predictable heights.

---

## 10. Deliverables and priority

Design in roadmap order so the first phases are not blocked:

| Priority | Phase | Deliverables |
|---|---|---|
| 1 | 0a / 0b | Tokens and themes, component library (§7), app shell (§5.1), object page layout with save indicator and panels (§5.8), error/offline/empty/loading patterns, Settings split (§5.16), Trash (§5.15), auth screens (§5.2) |
| 2 | 1 | Command palette (§5.4), Search page (§5.5), type marks (§6) |
| 3 | 2 | `[[` links, backlinks, unlinked mentions, local graph (§5.8), import wizard (§5.17) |
| 4 | 3 | Quick capture, Inbox, daily notes, snippets, onboarding (§5.6, 5.7, 5.11, 5.2) |
| 5 | 4 | Ask chat with citations, AI panel v2, AI suggestions, usage & limits (§5.13, 5.8, 5.7, 5.16) |
| 6 | 5 | Properties and type editor, saved views, Home redesign, reminders and review (§5.9, 5.10, 5.3, 5.12) |
| 7 | 6 | Sharing views, comments, co-editing, canvas, MCP connections (§5.20, 5.21) |

**For each screen, please deliver:** desktop (1440) and mobile (375) layouts; light and dark; all states listed above; interaction notes for keyboard flows; a clickable prototype for the four key flows: **capture → triage → link → ask**.

---

## 11. Open questions (product decisions that affect design)

| Question | Current default |
|---|---|
| Personal only, or team workspaces too? | Personal; team in Phase 6 |
| Mobile: PWA only, or a wrapped native app (needed for iOS share sheet)? | PWA only |
| How far does offline go? | Edits saved on the device and sent when back online |
| Ask/AI scope: include objects shared with me? | Own objects only |
| Trash retention | 30 days |
| Keep the current pink/purple "space" identity, or refresh it? | Designer's proposal welcome, must pass contrast |
