# PKS Design Implementation Todo

Feasible, ordered tasks from [DESIGN_IDEAS.md](./DESIGN_IDEAS.md). Implement in phase order.

---

## Phase 1 — Feedback & object detail (quick wins)

| # | Task | Status |
|---|------|--------|
| 1.1 | **Toast system** — Context + Toast component; success/error toasts for save, export, share, create | Done |
| 1.2 | **Skeleton loaders** — Dashboard list skeleton; ObjectDetail skeleton | Done |
| 1.3 | **Sticky action bar** — ObjectDetail: Export/Share/Edit bar stays visible on scroll | Done |
| 1.4 | **Collapsible sections** — ObjectDetail: Domains, Tags, Links, Attachments, Prompts, Version history as accordions | Done |

---

## Phase 2 — Navigation & dashboard

| # | Task | Status |
|---|------|--------|
| 2.1 | **Breadcrumbs** — ObjectDetail: `Dashboard > [Title]`; inner pages: `Dashboard > Settings` etc. | Done |
| 2.2 | **Type icons** — Map object types to icons (emoji or simple SVG); use in Dashboard list and ObjectDetail | Done |
| 2.3 | **Card/list toggle** — Dashboard: switch between list view and card grid; cards show title, type, summary | Done |

---

## Phase 3 — Creation & empty states

| # | Task | Status |
|---|------|--------|
| 3.1 | **Templates first** — ObjectNew: "Start from template" section at top; then type + title + content | Done |
| 3.2 | **Empty state** — Dashboard empty: add one-line value prop above "Create your first object" | Done |
| 3.3 | **Quick capture** — Optional "Quick add" on Dashboard or New: title + content only, save then add domains/tags later | Done |

---

## Phase 4 — Sidebar & command palette

| # | Task | Status |
|---|------|--------|
| 4.1 | **Sidebar** — Collapsible left sidebar: Home, New, Prompts, Templates, Notifications, Settings, Integrations, Audit logs | Done |
| 4.2 | **Command palette** — Ctrl+K (or Cmd+K): modal with search (objects), quick links (New, Prompts, Settings) | Done |

---

## Phase 5 — Polish

| # | Task | Status |
|---|------|--------|
| 5.1 | **Keyboard shortcuts** — `/` focus search, `N` new object, `Esc` close panels; `?` open Shortcuts help modal | Done |
| 5.2 | **Light mode** — Theme context + light CSS vars; toggle in Settings | Done |

---

## Phase 6 — Mobile & responsive

| # | Task | Status |
|---|------|--------|
| 6.1 | **Bottom nav (mobile)** — On small viewport: bottom bar with Home, New, Notifications, Settings | Done |
| 6.2 | **Sheets for panels** — ObjectDetail Export/Share open as bottom sheet on mobile | Done |
| 6.3 | **Responsive tables** — Audit logs / Integrations: card or stacked layout on narrow screens | Done |

---

*Update status as you complete each task.*
