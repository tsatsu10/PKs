import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Breadcrumbs from '../components/Breadcrumbs';
import './Journal.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  const startWeekday = first.getDay();
  return { days, startWeekday, lastDate: last.getDate() };
}

export default function Journal() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [view, setView] = useState('calendar'); // 'calendar' | 'entry'
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(null); // YYYY-MM-DD
  const [entryDates, setEntryDates] = useState(new Set()); // dates that have entries
  const [loadingDates, setLoadingDates] = useState(false);
  // entry state kept in sync with loaded row; content is the editable copy
  const [entry, setEntry] = useState(null); // eslint-disable-line no-unused-vars -- used for reset/sync
  const [content, setContent] = useState('');
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { days, startWeekday } = useMemo(() => getDaysInMonth(year, month), [year, month]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoadingDates(true);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const startStr = formatDateKey(start);
    const endStr = formatDateKey(end);
    supabase
      .from('journal_entries')
      .select('entry_date')
      .eq('user_id', user.id)
      .gte('entry_date', startStr)
      .lte('entry_date', endStr)
      .then(({ data }) => {
        if (cancelled) return;
        setEntryDates(new Set((data || []).map((r) => r.entry_date)));
        setLoadingDates(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, year, month]);

  function goPrevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }

  function goNextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  function handleDayClick(dateStr) {
    setSelectedDate(dateStr);
    setView('entry');
  }

  useEffect(() => {
    if (view !== 'entry' || !selectedDate || !user?.id) return;
    setLoadingEntry(true);
    setError('');
    supabase
      .from('journal_entries')
      .select('id, content, entry_date, updated_at')
      .eq('user_id', user.id)
      .eq('entry_date', selectedDate)
      .maybeSingle()
      .then(({ data, error: e }) => {
        setEntry(data || null);
        setContent(data?.content ?? '');
        setError(e?.message ?? '');
        setLoadingEntry(false);
      });
  }, [view, selectedDate, user?.id]);

  async function handleSaveEntry() {
    if (!user?.id || !selectedDate) return;
    setError('');
    setSaving(true);
    try {
      const { error: err } = await supabase.from('journal_entries').upsert(
        {
          user_id: user.id,
          entry_date: selectedDate,
          content: content.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,entry_date' }
      );
      if (err) throw err;
      setEntryDates((prev) => new Set([...prev, selectedDate]));
      addToast('success', 'Entry saved');
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to save');
      addToast('error', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function backToCalendar() {
    setView('calendar');
    setSelectedDate(null);
    setEntry(null);
    setContent('');
  }

  const monthLabel = useMemo(() => new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' }), [year, month]);

  if (!user) return null;

  if (view === 'entry') {
    return (
      <div className="journal-page" id="main-content" role="main">
        <header className="journal-header">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Journal' }, { label: selectedDate ?? '' }]} />
          <div className="journal-header-actions">
            <button type="button" className="btn btn-secondary journal-back-btn" onClick={backToCalendar}>
              ‹ Back to calendar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSaveEntry} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="journal-entry-block">
          <h2 className="journal-entry-date-title">{selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('default', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
          {loadingEntry ? (
            <p className="journal-muted">Loading…</p>
          ) : (
            <textarea
              className="journal-entry-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your journal entry for this day…"
              rows={14}
              aria-label="Journal entry"
            />
          )}
        </div>
      </div>
    );
  }

  const blankStart = Array.from({ length: startWeekday }, (_, i) => i);

  const todayStr = formatDateKey(new Date());
  const isViewingCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  return (
    <div className="journal-page" id="main-content" role="main">
      <header className="journal-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Journal' }]} />
        {!loadingDates && entryDates.size > 0 && (
          <span className="journal-header-meta">{entryDates.size} {entryDates.size === 1 ? 'entry' : 'entries'} this month</span>
        )}
      </header>

      <div className="journal-calendar-card">
        <div className="journal-calendar-nav">
          <button type="button" className="btn btn-icon journal-nav-btn" onClick={goPrevMonth} aria-label="Previous month">
            ‹
          </button>
          <h2 className="journal-calendar-title">{monthLabel}</h2>
          <button type="button" className="btn btn-icon journal-nav-btn" onClick={goNextMonth} aria-label="Next month">
            ›
          </button>
        </div>
        {isViewingCurrentMonth && (
          <button
            type="button"
            className="btn btn-secondary journal-today-btn"
            onClick={() => handleDayClick(todayStr)}
          >
            Today
          </button>
        )}

        {loadingDates ? (
          <p className="journal-muted journal-loading">Loading…</p>
        ) : (
          <div className="journal-calendar-grid" role="grid" aria-label={`Calendar for ${monthLabel}`}>
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="journal-calendar-cell journal-calendar-head" role="columnheader">
                {wd}
              </div>
            ))}
            {blankStart.map((i) => (
              <div key={`blank-${i}`} className="journal-calendar-cell journal-calendar-blank" />
            ))}
            {days.map((d) => {
              const dateStr = formatDateKey(new Date(year, month, d));
              const hasEntry = entryDates.has(dateStr);
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={d}
                  type="button"
                  className={`journal-calendar-cell journal-calendar-day ${hasEntry ? 'has-entry' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => handleDayClick(dateStr)}
                  role="gridcell"
                  aria-label={`${d} ${monthLabel}${hasEntry ? ', has entry' : ''}`}
                >
                  <span className="journal-day-num">{d}</span>
                  {hasEntry && <span className="journal-day-dot" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}

        <p className="journal-legend">Click a date to write. Dots show days with entries.</p>
      </div>
    </div>
  );
}
