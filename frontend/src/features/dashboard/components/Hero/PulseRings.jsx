import './PulseRings.css';

const RING_META = [
  { key: 'capture', label: 'Capture', color: 'var(--cosmic-pink)' },
  { key: 'tend', label: 'Tend', color: 'var(--midnight-purple-accent)' },
  { key: 'close', label: 'Close', color: '#10b981' },
];

/**
 * Three concentric daily rhythm rings.
 */
export default function PulseRings({ values, targets, loading, celebrateRing = null }) {
  const size = 72;
  const center = size / 2;
  const rings = [
    { r: 30, ...RING_META[0], value: values.capture, target: targets.capture },
    { r: 22, ...RING_META[1], value: values.tend, target: targets.tend },
    { r: 14, ...RING_META[2], value: values.close, target: targets.close },
  ];

  const ariaParts = rings.map((ring) => {
    const pct = ring.target > 0 ? Math.min(ring.value / ring.target, 1) : 0;
    const done = pct >= 1;
    return `${ring.label}: ${ring.value} of ${ring.target}${done ? ', complete' : ''}`;
  });

  return (
    <div className="pulse-rings" role="img" aria-label={loading ? 'Loading daily progress' : ariaParts.join('. ')}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="pulse-rings-svg">
        {rings.map((ring) => {
          const circumference = 2 * Math.PI * ring.r;
          const pct = ring.target > 0 ? Math.min(ring.value / ring.target, 1) : 0;
          const offset = circumference * (1 - pct);
          return (
            <g key={ring.key}>
              <circle
                cx={center}
                cy={center}
                r={ring.r}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="4"
              />
              <circle
                cx={center}
                cy={center}
                r={ring.r}
                fill="none"
                stroke={ring.color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={loading ? circumference : offset}
                transform={`rotate(-90 ${center} ${center})`}
                className={`pulse-rings-progress${celebrateRing === ring.key ? ' pulse-rings-progress--celebrate' : ''}`}
              />
            </g>
          );
        })}
      </svg>
      <ul className="pulse-rings-legend">
        {rings.map((ring) => (
          <li key={ring.key}>
            <span className="pulse-rings-dot" style={{ background: ring.color }} aria-hidden="true" />
            <span className="pulse-rings-legend-label">{ring.label}</span>
            <span className="pulse-rings-legend-value">{ring.value}/{ring.target}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
