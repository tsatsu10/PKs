import { useState, useEffect } from 'react';
import { loadPulseTargets, savePulseTargets } from '../../hooks/usePulseMetrics';
import './PulseTargetsForm.css';

const RING_LABELS = [
  { key: 'capture', label: 'Capture', hint: 'New objects created today' },
  { key: 'tend', label: 'Tend', hint: 'Objects updated today' },
  { key: 'close', label: 'Close', hint: 'Objects archived today' },
];

/**
 * Daily pulse ring targets (localStorage-backed).
 */
export default function PulseTargetsForm() {
  const [targets, setTargets] = useState(loadPulseTargets);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const handleChange = (key, raw) => {
    const n = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
    setTargets((prev) => ({ ...prev, [key]: n }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    savePulseTargets(targets);
    setSaved(true);
  };

  return (
    <form className="pulse-targets-form" onSubmit={handleSave}>
      <p className="pulse-targets-form-intro muted">
        Set daily goals for your dashboard pulse rings. Progress resets at midnight in your browser&apos;s timezone.
      </p>
      <div className="pulse-targets-form-grid">
        {RING_LABELS.map(({ key, label, hint }) => (
          <label key={key} className="pulse-targets-form-field">
            <span className="pulse-targets-form-label">{label}</span>
            <span className="pulse-targets-form-hint">{hint}</span>
            <input
              type="number"
              min={0}
              max={99}
              value={targets[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              aria-label={`${label} daily target`}
            />
          </label>
        ))}
      </div>
      <div className="pulse-targets-form-actions">
        <button type="submit" className="btn btn-primary btn-small">Save targets</button>
        {saved && <span className="pulse-targets-form-saved" role="status">Saved</span>}
      </div>
    </form>
  );
}
