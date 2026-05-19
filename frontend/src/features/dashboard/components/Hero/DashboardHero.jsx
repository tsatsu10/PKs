import PulseRings from './PulseRings';
import TrailheadRow from './TrailheadRow';
import './DashboardHero.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDateLine() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Constellation v2 hero: greeting + pulse rings + trailheads.
 */
export default function DashboardHero({
  displayName,
  pulseValues,
  pulseTargets,
  pulseLoading,
  celebrateRing = null,
  resumeObject,
  pendingObject,
  sparkObject,
  runPromptSuffix = '',
  isFirstRun = false,
}) {
  return (
    <section
      className={`dashboard-hero-v2${celebrateRing ? ' dashboard-hero-v2--celebrate' : ''}`}
      aria-label="Dashboard overview"
    >
      <div className="dashboard-hero-v2-top">
        <div className="dashboard-hero-v2-copy">
          <p className="dashboard-hero-v2-date">{formatDateLine()}</p>
          <h1 className="dashboard-hero-v2-greeting">
            {getGreeting()}
            {displayName ? `, ${displayName}` : ''}
          </h1>
          {isFirstRun && (
            <p className="dashboard-hero-v2-hint">Create your first object to start your daily rhythm.</p>
          )}
        </div>
        <PulseRings
          values={pulseValues}
          targets={pulseTargets}
          loading={pulseLoading}
          celebrateRing={celebrateRing}
        />
      </div>

      {!isFirstRun && (
        <TrailheadRow
          resumeObject={resumeObject}
          pendingObject={pendingObject}
          sparkObject={sparkObject}
          runPromptSuffix={runPromptSuffix}
        />
      )}
    </section>
  );
}
