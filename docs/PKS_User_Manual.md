# PKS User Manual

**Personal Knowledge System — Your second brain for knowledge**

---

## What PKS Does

PKS turns scattered information (notes, documents, reports, PDFs) into **structured, searchable, linked knowledge**. Capture once, use everywhere. Without prompts it stores and organizes; with prompts it reasons and synthesizes.

---

## Core Concepts

### Knowledge Objects

Everything you capture is a **knowledge object**: a note, document, SOP, report, proposal, guideline, insight, concept, case, research paper, etc.

Each object has:
- **Title**
- **Summary** (optional)
- **Content** (main text; supports **Markdown** — headings, bold, italic, lists, links, code, and more)
- **Source** (where it came from)
- **Key points** (optional list)

### Domains

Domains are your top-level categories (e.g. Health, Tech, Finance). Assign one or more domains to each object so you can filter and browse by area.

### Tags

Tags are flexible labels you add to objects. Use them for themes, topics, or workflows.

### Links

Link objects to each other. A report can link to its source document; a guideline can link to related SOPs. Links form a **knowledge graph** so you can move between related ideas quickly.

---

## Capturing Knowledge

### Create an Object

1. Click **New object** on the dashboard.
2. Choose a **type** (note, document, sop, report, etc.).
3. Add **title**, **summary**, and **content**. Use the Content editor’s toolbar or type Markdown (e.g. `## Heading`, `**bold**`, `- list item`) for formatted text.
4. Save.

### Quick Capture

Use **Quick capture** for fast entry: minimal fields, save in seconds. You can add domains, tags, and content later.

### Attach Files

On an object’s detail page, add PDF, DOCX, or TXT under **Attachments**. Files stay linked to the object and can be downloaded from there.

---

## Organizing

### Domains & Tags

On an object’s page, under **Domains** and **Tags**, add or remove classifications. Suggested tags appear based on similar objects; you can add them with one click.

### Related Objects

PKS suggests objects you might want to link (same domain or similar tags). Use the **Related you might link** block and click **Link** to connect them.

---

## Synthesizing (Run Prompts)

Prompts turn PKS from storage into a **synthesis engine**.

1. Open an object.
2. Find the **Synthesize** block near the title (or **Run prompt** in the prompts section).
3. Choose a prompt template and click **Run prompt**.
4. Paste the output or click **Generate with AI** when AI is enabled (see below).
5. Optionally **Save as new object** — it will be auto-linked to the source.

**AI-powered generation:** The **Generate with AI** button uses the `run-prompt` Edge Function (OpenAI). To enable it, configure `OPENAI_API_KEY` in your Supabase project’s Edge Function secrets. If the key is not set, the app still works; you can paste prompt output manually.

---

## Finding Things

### Search

Use the search bar on the dashboard. Search covers title, summary, content, and tags.

### Filters

- **Quick domain filters**: One-tap pills (All, Health, Tech, etc.) under the search bar.
- **Full filters**: Open **Filters** for type, domain, tag, and date range.

### Dashboard

Objects appear as a list or cards. Use view toggle (≡ list / ▦ cards), select objects for batch export, or open any object for full detail.

---

## Exporting

### Single Object

1. Open an object.
2. Click **Export**.
3. Choose **format** (TXT, Markdown, HTML, JSON, DOCX, PDF).
4. Choose **template** (Raw, Brief, Full, Stakeholder).
5. Set **Include** toggles (content, summary, tags, domains, links).
6. Click **Export**.

### Recent Exports

In the export panel, **Recent exports** shows the latest jobs. Completed exports show ✓ Ready; failed ones show **Retry**.

---

## Sharing (If Enabled)

Share an object with another user as **viewer** or **editor**. Manage shares from the object’s share panel.

---

## Version History

Every edit creates a new version. View **Version history** on an object to see changes over time.

---

## Tips

- Use domains for broad filters; use tags for cross-cutting themes.
- Link related objects so you can follow trails from one idea to another.
- Run prompts on rich objects to produce summaries, briefs, or new linked notes.
- Export often — reports, proposals, and checklists can be generated from your knowledge base.

---

## Keyboard Shortcuts

- **/** — Focus search (when not typing in a field)

---

*PKS is designed for low-bandwidth environments. Keep objects lean; use summaries; rely on search and filters instead of endless scrolling.*
