import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Breadcrumbs from '../components/Breadcrumbs';
import './Import.css';

function parseMarkdown(text) {
  const items = [];
  const blocks = text.split(/(?=^##\s)/m).filter((b) => b.trim());
  for (const block of blocks) {
    const firstLine = block.indexOf('\n');
    let title = firstLine === -1 ? block.trim() : block.slice(0, firstLine).trim();
    let content = firstLine === -1 ? '' : block.slice(firstLine + 1).trim();
    if (title.startsWith('## ')) title = title.slice(3).trim();
    if (!title) title = content.slice(0, 60) || 'Untitled';
    items.push({ title, content });
  }
  if (items.length === 0 && text.trim()) {
    const lines = text.trim().split('\n');
    const title = lines[0]?.slice(0, 200) || 'Imported';
    const content = lines.slice(1).join('\n').trim() || lines[0] || '';
    items.push({ title, content });
  }
  return items;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === 'title' || h === 'name');
  const contentIdx = header.findIndex((h) => h === 'content' || h === 'body' || h === 'text');
  const typeIdx = header.findIndex((h) => h === 'type');
  if (titleIdx === -1 && contentIdx === -1) return [];
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const title = titleIdx >= 0 ? (cells[titleIdx] || '') : (cells[contentIdx]?.slice(0, 200) || 'Imported');
    const content = contentIdx >= 0 ? (cells[contentIdx] || '') : '';
    const type = typeIdx >= 0 && cells[typeIdx] ? cells[typeIdx] : 'note';
    if (title || content) items.push({ title: title || 'Untitled', content, type });
  }
  return items;
}

export default function Import() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState('md');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!user?.id) return;
    setError('');
    setResult(null);
    let items = [];
    if (file) {
      const raw = await file.text();
      items = mode === 'csv' ? parseCSV(raw) : parseMarkdown(raw);
    } else if (text.trim()) {
      items = mode === 'csv' ? parseCSV(text) : parseMarkdown(text);
    }
    if (items.length === 0) {
      setError('No items to import. Add Markdown sections (## Title) or a CSV with title/content columns.');
      return;
    }
    setImporting(true);
    let created = 0;
    let failed = 0;
    try {
      for (const item of items) {
        const { error: err } = await supabase.from('knowledge_objects').insert({
          user_id: user.id,
          type: item.type || 'note',
          title: item.title.slice(0, 500),
          content: item.content || null,
          summary: null,
          source: null,
        });
        if (err) failed++;
        else created++;
      }
      setResult({ created, failed, total: items.length });
      addToast('success', `Imported ${created} object(s)`);
      if (created > 0) navigate('/', { replace: true });
    } catch (e) {
      setError(e?.message ?? 'Import failed');
      addToast('error', e?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setText('');
    if (f) {
      const ext = (f.name || '').toLowerCase();
      setMode(ext.endsWith('.csv') ? 'csv' : 'md');
    }
  }

  return (
    <div className="import-page">
      <header className="import-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Import' }]} />
        <h1 className="import-title">Import objects</h1>
        <p className="import-desc">Import from Markdown (sections with ##) or CSV (columns: title, content, optional type).</p>
      </header>

      <section className="import-section">
        <div className="import-mode">
          <label><input type="radio" name="mode" checked={mode === 'md'} onChange={() => setMode('md')} /> Markdown</label>
          <label><input type="radio" name="mode" checked={mode === 'csv'} onChange={() => setMode('csv')} /> CSV</label>
        </div>
        <div className="import-inputs">
          <label className="import-file-label">
            <span className="btn btn-secondary">Choose file</span>
            <input type="file" accept=".md,.csv,.txt" onChange={onFileChange} className="import-file-input" />
          </label>
          <span className="import-or">or paste below</span>
          <textarea
            className="import-textarea"
            placeholder={mode === 'md' ? '## First note\nContent here...\n\n## Second note\n...' : 'title,content,type\nMy note,Content here,note'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            disabled={!!file}
          />
        </div>
        {error && <div className="import-error" role="alert">{error}</div>}
        {result && (
          <p className="import-result">
            Created {result.created} of {result.total} object(s).{result.failed ? ` ${result.failed} failed.` : ''}
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing || (!text.trim() && !file)}>
          {importing ? 'Importing…' : 'Import'}
        </button>
      </section>

      <p className="import-footer">
        <Link to="/" className="import-back">← Back to Dashboard</Link>
      </p>
    </div>
  );
}
