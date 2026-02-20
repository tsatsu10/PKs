import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import './About.css';

export default function About() {
  return (
    <div className="about-page">
      <header className="about-header">
        <Breadcrumbs items={[{ label: 'About', to: '/about' }]} />
        <h1 className="about-title">About PKS</h1>
        <p className="about-tagline">Your second brain — capture, organize, and synthesize knowledge.</p>
      </header>

      <div className="about-content">
        <section className="about-section">
          <h2>What this project is</h2>
          <p>
            <strong>PKS (Personal Knowledge System)</strong> is a private, user-owned app for building and using your own knowledge base. 
            You store notes, ideas, references, and content as <em>objects</em> — each with a type, domains, tags, and rich text. 
            You can link objects together, run AI-powered prompts on them, and use templates to keep structure consistent. 
            Everything lives in your Supabase project so you own the data and can extend the system as you like.
          </p>
        </section>

        <section className="about-section">
          <h2>Inspiration</h2>
          <p>
            PKS draws from the idea of a <strong>second brain</strong>: a single place to capture what you learn and produce, 
            so you can find it later and turn it into something useful. It’s inspired by tools and practices like 
            Zettelkasten, building blocks of knowledge, and workflows that separate <em>capture</em> from <em>organize</em> and <em>synthesize</em>. 
            The design aims for a calm, focused interface (dark theme, clear hierarchy, minimal clutter) so you can 
            think and create without distraction.
          </p>
        </section>

        <section className="about-section">
          <h2>Essence</h2>
          <ul className="about-list">
            <li><strong>Capture first</strong> — Quick capture and Paste bin get ideas in before they’re lost.</li>
            <li><strong>Structure when you’re ready</strong> — Types, domains, tags, and templates give shape without forcing it up front.</li>
            <li><strong>Connect and reuse</strong> — Links between objects and a Prompt bank let you combine and reuse knowledge.</li>
            <li><strong>You own it</strong> — Data stays in your Supabase; no vendor lock-in, no opaque cloud.</li>
          </ul>
        </section>

        <section className="about-section">
          <h2>How to use it</h2>
          <ul className="about-list">
            <li><strong>Dashboard</strong> — See recent objects, search, filter by type/domain/tag, and open anything quickly.</li>
            <li><strong>New object</strong> — Create a note, reference, or custom type; pick a template, add domains and tags, write content.</li>
            <li><strong>Quick capture</strong> — Dump a thought or link in seconds; refine and link later from the dashboard.</li>
            <li><strong>Paste bin</strong> — Store snippets and pastes; turn them into full objects when they become important.</li>
            <li><strong>Journal</strong> — Daily or periodic entries; good for logs, reflection, or time-based notes.</li>
            <li><strong>Prompts</strong> — Save prompt templates and run them on objects (e.g. summarize, outline, suggest links) with your AI provider.</li>
            <li><strong>Templates</strong> — Define reusable shapes for objects (fields, types) so capture stays consistent.</li>
            <li><strong>Settings</strong> — Manage domains, tags, theme, and account.</li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Applications</h2>
          <p>
            PKS can support many workflows: a research or reading log, a project wiki, a personal CRM, 
            a place for meeting notes and follow-ups, or a general “everything bucket” that you gradually 
            structure. Use domains for life areas (work, health, hobbies), tags for topics, and links to 
            build a graph of related ideas. Combine with <strong>Integrations</strong> (e.g. webhooks) 
            to push or pull data from other tools, and use <strong>Audit logs</strong> to see what changed when.
          </p>
        </section>

        <section className="about-section">
          <h2>How PKS works</h2>
          <div className="about-flow">
            <div className="about-flow-step"><span className="about-flow-num">1</span> <strong>Capture</strong> — Quick capture, Paste bin, or New object</div>
            <div className="about-flow-arrow">→</div>
            <div className="about-flow-step"><span className="about-flow-num">2</span> <strong>Organize</strong> — Domains, tags, templates, links</div>
            <div className="about-flow-arrow">→</div>
            <div className="about-flow-step"><span className="about-flow-num">3</span> <strong>Synthesize</strong> — Run prompts, export, connect ideas</div>
          </div>
        </section>

        <section className="about-section">
          <h2>Privacy &amp; data</h2>
          <p>
            Your data is stored in <strong>your own Supabase project</strong>. We do not send your content to any third party except when you explicitly run an AI prompt (then the text you send goes to the provider you configure). No analytics or tracking are built in. You can export all data from Settings → Export &amp; backup.
          </p>
        </section>

        <section className="about-section">
          <h2>What&apos;s new</h2>
          <ul className="about-list">
            <li>Main menu deck on Dashboard (toggle in Settings).</li>
            <li>Dedicated Search page and global search from command palette (⌘K).</li>
            <li>Export &amp; backup: download all objects as JSON or Markdown ZIP (Settings).</li>
            <li>PWA: install app on device (Settings → Install app).</li>
            <li>Getting started tips on first visit to Dashboard.</li>
            <li>Clearer empty states and feedback link below.</li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Feedback</h2>
          <p>
            Found a bug or have an idea? <a href="https://github.com" className="about-link" target="_blank" rel="noopener noreferrer">Open an issue on GitHub</a> or email feedback to your project maintainer.
          </p>
        </section>

        <p className="about-footer">
          <Link to="/" className="about-back">← Back to Dashboard</Link>
        </p>
      </div>
    </div>
  );
}
