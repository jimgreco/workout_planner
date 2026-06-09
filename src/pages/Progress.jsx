import { useState } from 'react';
import { BarChart3, CalendarDays, Dumbbell, Flame, Star, Trophy, TrendingUp } from 'lucide-react';
import { buildProgress, formatVolume, setLabel } from '../progress.js';

const RANGE_OPTIONS = [
  { id: '7', label: '7D' },
  { id: '30', label: '30D' },
  { id: '90', label: '90D' },
  { id: 'all', label: 'All' },
];

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function fullDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatCard({ icon, label, value, detail }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
        {detail && <div className="metric-detail">{detail}</div>}
      </div>
    </div>
  );
}

function WeeklyBars({ series }) {
  if (series.length === 0) {
    return <div className="empty-state compact"><p>No finished workouts in this range.</p></div>;
  }

  const maxVolume = Math.max(...series.map((item) => item.volume), 1);
  return (
    <div className="weekly-bars" aria-label="Weekly volume">
      {series.slice(-10).map((item) => {
        const height = Math.max(8, (item.volume / maxVolume) * 112);
        return (
          <div className="weekly-bar-column" key={item.week}>
            <div className="weekly-bar-value">{item.volume > 0 ? formatVolume(item.volume).replace(' lb', '') : '0'}</div>
            <div className="weekly-bar-track">
              <div className="weekly-bar-fill" style={{ height }} />
            </div>
            <div className="weekly-bar-label">{formatDate(item.week)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MuscleSplit({ items }) {
  if (items.length === 0) {
    return <div className="empty-state compact"><p>No muscle-group data yet.</p></div>;
  }

  const maxSets = Math.max(...items.map((item) => item.sets), 1);
  return (
    <div className="split-list">
      {items.slice(0, 8).map((item) => (
        <div className="split-row" key={item.muscleGroup}>
          <div className="split-row-header">
            <span>{item.muscleGroup}</span>
            <span>{item.sets} sets</span>
          </div>
          <div className="split-bar">
            <div style={{ width: `${Math.max(6, (item.sets / maxSets) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopExerciseList({ items }) {
  if (items.length === 0) {
    return <div className="empty-state compact"><p>No exercise history yet.</p></div>;
  }

  return (
    <div className="progress-list">
      {items.slice(0, 6).map((summary) => (
        <div className="progress-list-item" key={summary.exercise.id}>
          <div>
            <div className="progress-list-title">{summary.exercise.name}</div>
            <div className="progress-list-meta">
              {summary.sessions} session{summary.sessions === 1 ? '' : 's'} · {summary.totalSets} sets
            </div>
          </div>
          <div className="progress-list-value">{formatVolume(summary.totalVolume)}</div>
        </div>
      ))}
    </div>
  );
}

function RecentPBs({ items }) {
  if (items.length === 0) {
    return <div className="empty-state compact"><p>No PRs in recent history.</p></div>;
  }

  return (
    <div className="progress-list">
      {items.map((item) => (
        <div className="progress-list-item" key={item.id}>
          <div>
            <div className="progress-list-title">{item.exercise.name}</div>
            <div className="progress-list-meta">{item.logName}</div>
          </div>
          <div className="progress-list-value">{formatDate(item.date)}</div>
        </div>
      ))}
    </div>
  );
}

function LatestBest({ items }) {
  const withBest = items.find((summary) => summary.best);
  if (!withBest) return null;
  return (
    <div className="progress-callout">
      <div className="metric-icon"><Trophy size={18} /></div>
      <div>
        <div className="progress-callout-title">{withBest.exercise.name}</div>
        <div className="progress-callout-meta">
          Best recent set: {setLabel(withBest.best.set, withBest.best.item.weightType, withBest.exercise.usesTime)} · {fullDate(withBest.best.date)}
        </div>
      </div>
    </div>
  );
}

function formatTrendValue(metric, value) {
  if (metric.id === 'volume') return formatVolume(value);
  return Math.round(value).toLocaleString();
}

function TrendSummary({ metrics, improvement }) {
  if ((metrics?.length ?? 0) === 0 && !improvement) return null;

  return (
    <section className="progress-panel progress-trends" aria-label="Performance trends">
      <div className="panel-heading">
        <h2>Performance Trends</h2>
      </div>
      {metrics?.length > 0 && (
        <div className="trend-metric-grid">
          {metrics.map((metric) => {
            const direction = metric.delta > 0 ? 'up' : metric.delta < 0 ? 'down' : 'flat';
            const sign = metric.delta > 0 ? '+' : '';
            return (
              <div className={`trend-metric ${direction}`} key={metric.id}>
                <span>{metric.label}</span>
                <strong>{formatTrendValue(metric, metric.current)}</strong>
                <em>
                  {sign}{formatTrendValue(metric, metric.delta)} · {sign}{Math.round(metric.percent)}%
                </em>
              </div>
            );
          })}
        </div>
      )}
      {improvement && (
        <div className="trend-improvement">
          <TrendingUp size={18} />
          <div>
            <strong>{improvement.exercise.name}</strong>
            <span>
              Best set improved {Math.round(improvement.percent)}% from {setLabel(improvement.previous.set, improvement.previous.item?.weightType, improvement.exercise.usesTime)} to {setLabel(improvement.latest.set, improvement.latest.item?.weightType, improvement.exercise.usesTime)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Progress({ logs, exercises }) {
  const [selectedRange, setSelectedRange] = useState('90');
  const progress = buildProgress(logs, exercises, selectedRange);
  const rangeLabel = selectedRange === 'all' ? 'all time' : `last ${selectedRange} days`;

  return (
    <div className="page progress-page">
      <div className="action-row progress-heading">
        <h1 style={{ marginBottom: 0 }}>Progress</h1>
        <div className="range-toggle" aria-label="Progress range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={option.id === selectedRange ? 'active' : ''}
              onClick={() => setSelectedRange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {progress.totalWorkouts === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><BarChart3 size={48} /></div>
          <p>Finish a workout to see progress here.</p>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <StatCard icon={<Dumbbell size={18} />} label="Workouts" value={progress.totalWorkouts} detail={rangeLabel} />
            <StatCard icon={<TrendingUp size={18} />} label="Volume" value={formatVolume(progress.totalVolume)} />
            <StatCard icon={<CalendarDays size={18} />} label="Avg Sets" value={progress.averageSets.toFixed(1)} detail="per workout" />
            <StatCard icon={<Flame size={18} />} label="Streak" value={`${progress.streak} day${progress.streak === 1 ? '' : 's'}`} />
            <StatCard icon={<Star size={18} />} label="PRs" value={progress.pbCount} detail="in range" />
          </div>

          <LatestBest items={progress.topExercises} />

          <TrendSummary metrics={progress.trends} improvement={progress.strongestImprovement} />

          <div className="progress-grid">
            <section className="progress-panel progress-panel-wide">
              <div className="panel-heading">
                <h2>Weekly Volume</h2>
              </div>
              <WeeklyBars series={progress.weeklySeries} />
            </section>

            <section className="progress-panel">
              <div className="panel-heading">
                <h2>Muscle Split</h2>
              </div>
              <MuscleSplit items={progress.muscleSplit} />
            </section>

            <section className="progress-panel">
              <div className="panel-heading">
                <h2>Top Exercises</h2>
              </div>
              <TopExerciseList items={progress.topExercises} />
            </section>

            <section className="progress-panel">
              <div className="panel-heading">
                <h2>Recent PRs</h2>
              </div>
              <RecentPBs items={progress.recentPBs} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
