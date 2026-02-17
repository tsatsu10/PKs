# PKS — Design Ideas & Suggestions

This document suggests design directions based on the current codebase and the product vision (Second Brain for African Tech & Health). Use it as a backlog of ideas, not a fixed spec.

---

## 1. Product & codebase snapshot

- **Product:** PKS = structured knowledge objects (notes, documents, SOPs, reports, etc.) with domains, tags, links, prompt-driven synthesis, export, and sharing.
- **Current UI:** Dark theme (Space Black, Cosmic Pink, Midnight Purple), glassmorphism, Plus Jakarta Sans. Dashboard = search + filters + flat list; ObjectDetail = long single column with many sections (meta, edit/view, domains, tags, links, attachments, prompts, export, share, versions).
- **Users:** African Tech & Health professionals; knowledge workers who need to capture, structure, and reuse what they learn.

---

## 2. Information architecture & navigation

| Idea | What | Why |
|------|------|-----|
| **Persistent sidebar** | Optional collapsible left sidebar with: Home, New object, Prompts, Templates, Notifications, Settings, Integrations, Audit logs. Dashboard stays the main “home” with search. | Reduces reliance on the header link list; clearer mental model and faster switching between “create”, “prompts”, and “library”. |
| **Breadcrumbs** | On ObjectDetail and inner pages: `Dashboard > [Object title]` or `Dashboard > Settings > Domains`. | Clarifies location and one-click back to parent. |
| **Command palette (Ctrl+K)** | Global modal: type to search objects, go to “New object”, “Prompts”, “Settings”, run a recent prompt. | Power users can stay on keyboard; aligns with “second brain” tool feel. |
| **Dashboard as “home”** | Keep dashboard as the default landing; consider a short “Recent” or “Continue reading” strip above or beside the main list. | Reinforces “your library” and quick re-entry into recent work. |

---

## 3. Dashboard & discovery

| Idea | What | Why |
|------|------|-----|
| **Card vs list toggle** | View switch: list (current) vs grid of cards (title, type pill, domain/tag chips, short summary). | Cards improve scannability and feel more “asset-oriented”; list is compact for power users. |
| **Type icons** | Small icon or colored dot per object type (e.g. document, report, SOP) in list and detail. | Faster visual parsing and reinforces that PKS is multi-type. |
| **Domain/tag pills on list rows** | Show 1–2 domain or tag pills per row (with overflow “+2”). | Surfaces structure at a glance; supports “filter by domain” mental model. |
| **Saved / quick filters** | Let users save a filter combo (e.g. “Health SOPs”, “Last 7 days”) and show as chips or a dropdown. | Reduces repeated filter setup; supports recurring workflows. |
| **Empty state** | Already improved with “Create your first object” CTA; could add a one-line value prop or illustration. | Strengthens first-run experience and clarity of purpose. |

---

## 4. Object detail & reading experience

| Idea | What | Why |
|------|------|-----|
| **Sticky action bar** | Keep Export / Share / Edit in a bar that stays visible on scroll (e.g. below header or as a floating bar). | Long objects (e.g. reports) don’t require scrolling up to export or share. |
| **Collapsible sections** | Domains, Tags, Links, Attachments, Prompts, Version history as collapsible `<details>` or accordions. | Reduces initial scroll; user expands what they need. |
| **Table of contents (TOC)** | For long content: auto-generate TOC from headings (if you add heading structure or markdown). | Improves navigation in long documents. |
| **Reading mode** | Optional “reading” view: hide actions and metadata, max-width text, comfortable line height. | Focus mode for consumption. |
| **Type-specific layouts** | Slightly different layouts per type (e.g. report: summary at top, then sections; SOP: steps emphasis). | Aligns UI with how each asset type is used. |

---

## 5. Creation & editing

| Idea | What | Why |
|------|------|-----|
| **Templates first** | On “New object”, show templates prominently at the top (e.g. “Start from template” with thumbnails or short descriptions). | Matches product differentiator (templates + structure); reduces blank-page friction. |
| **Quick capture** | Optional minimal flow: title + one big content field → save → “Add domains/tags later”. | Fast capture when time is short; structure can follow. |
| **AI-first create** | “Describe what you want to capture” → one sentence or paste → AI suggests title, type, summary, key points. | Positions PKS as intelligent and reduces form filling. |
| **Inline edit** | On ObjectDetail, allow editing title/summary in place (e.g. click to edit) instead of a single “Edit” mode. | Feels lighter and more document-like. |

---

## 6. Visual & brand (African Tech & Health)

| Idea | What | Why |
|------|------|-----|
| **Subtle regional identity** | Optional: palette accent inspired by African design (e.g. earth, indigo, or existing pink/purple framed as “energy + depth”); or a single illustration/motif on empty or auth. | Differentiates without cliché; reinforces “for African professionals”. |
| **Type icons** | Consistent icon set for object types (document, report, SOP, insight, etc.). | Improves recognition and makes the product feel finished. |
| **Light mode** | Optional theme toggle (e.g. in Settings) with a light palette that keeps contrast and readability. | Accessibility and preference; some users work in bright environments. |
| **Illustration for empty / auth** | Simple, on-brand illustration on login, register, or “no results” (e.g. knowledge nodes, or abstract “building blocks”). | Warmth and clarity; supports positioning as a thinking tool. |

---

## 7. Empty states & onboarding

| Idea | What | Why |
|------|------|-----|
| **First-time checklist** | After signup: “Create first object”, “Add a domain”, “Run a prompt” as optional checklist with short copy. | Gentle onboarding without blocking. |
| **Sample / demo object** | Optional “Try a sample object” that pre-fills one report or note so users can explore prompts and export. | Reduces “what do I put here?” and showcases value. |
| **Contextual tips** | Small tooltips or one-time hints (e.g. “You can run prompts from here to generate summaries”) on key screens. | Surfaces power features without a long tour. |

---

## 8. Feedback & polish

| Idea | What | Why |
|------|------|-----|
| **Toasts** | Success/error toasts for create, save, export, share (in addition to or instead of only inline error divs). | Clear, non-blocking feedback; errors don’t get lost above the fold. |
| **Skeleton loaders** | Replace “Loading…” text with skeleton placeholders on dashboard list and object detail. | Feels faster and more polished. |
| **Optimistic updates** | For non-destructive actions (e.g. add tag, mark notification read), update UI immediately and roll back on error. | Snappier feel. |
| **Keyboard shortcuts** | e.g. `N` = new object, `Esc` = close panel, `/` = focus search. Document in a “Shortcuts” modal (e.g. `?`). | Power users and “second brain” positioning. |

---

## 9. Mobile & responsive

| Idea | What | Why |
|------|------|-----|
| **Bottom nav (mobile)** | On small viewports, primary actions (Home, New, Notifications, Settings) in a bottom bar. | Thumb-friendly; matches common app patterns. |
| **Sheets for panels** | Export, Share, and maybe filters open as bottom sheets on mobile instead of inline sections. | Preserves space for content; feels native. |
| **Responsive tables** | Audit logs / Integrations: card layout or stacked rows on narrow screens. | Prevents horizontal scroll and keeps data readable. |

---

## 10. Prioritisation suggestions

- **High impact, moderate effort:** Sticky action bar on ObjectDetail, collapsible sections, toasts, skeleton loaders, card/list toggle on dashboard.
- **High impact, higher effort:** Command palette, sidebar navigation, templates-first on New object, light mode.
- **Brand & identity:** Type icons, one or two illustrations (empty/auth), optional regional accent in palette.
- **Later:** Full reading mode, TOC, saved filters, AI-first create, mobile bottom nav.

Use this list to pick the next design improvements that best match your roadmap and users (e.g. African tech/health professionals who need fast capture and synthesis).
