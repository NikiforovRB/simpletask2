import { useMemo } from 'react';
import { STATS_MODES, buildStats, formatRange, plural } from '../lib/girls';

const formatAvg = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');

/**
 * Acquaintances per week / month. A click on a bar filters the list by that
 * period (and a second click resets it).
 */
export function GirlsStats({ girls, today, mode, open, onMode, onToggle, activeRange, onPickRange }) {
  const buckets = useMemo(() => buildStats(girls, mode, today), [girls, mode, today]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const current = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  const delta = current.count - prev.count;
  const avg = buckets.reduce((s, b) => s + b.count, 0) / buckets.length;
  const withDates = girls.filter((g) => g.dates.length > 0).length;
  const week = mode === 'week';

  return (
    <section className={`girls-stats ${open ? 'girls-stats--open' : ''}`}>
      <div className="girls-stats__head">
        <button type="button" className="girls-stats__toggle" onClick={onToggle} aria-expanded={open}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span className="girls-stats__title">Статистика</span>
          {!open && (
            <span className="girls-stats__peek">
              {current.count} {week ? 'за неделю' : 'за месяц'} · всего {girls.length}
            </span>
          )}
        </button>
        {open && (
          <div className="girls-stats__modes" role="tablist">
            {STATS_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                className={`girls-stats__mode ${mode === m.key ? 'girls-stats__mode--on' : ''}`}
                onClick={() => onMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="girls-stats__chart">
            {buckets.map((b, i) => {
              const active = activeRange && activeRange.from === b.from && activeRange.to === b.to;
              return (
                <button
                  key={b.from}
                  type="button"
                  className={`girls-stats__bar ${active ? 'girls-stats__bar--active' : ''} ${i === buckets.length - 1 ? 'girls-stats__bar--current' : ''}`}
                  onClick={() => onPickRange(active ? null : { from: b.from, to: b.to })}
                  title={`${formatRange(b.from, b.to)}: ${b.count} ${plural(b.count, 'знакомство', 'знакомства', 'знакомств')}`}
                >
                  <span className="girls-stats__value">{b.count || ''}</span>
                  <span className="girls-stats__track">
                    <span className="girls-stats__fill" style={{ height: `${(b.count / max) * 100}%` }} />
                  </span>
                  <span className="girls-stats__label">{b.label}</span>
                </button>
              );
            })}
          </div>

          <div className="girls-stats__summary">
            <div className="girls-stats__cell">
              <span className="girls-stats__num">{current.count}</span>
              <span className="girls-stats__cap">
                {week ? 'за эту неделю' : 'за этот месяц'}
                {delta !== 0 && (
                  <span className={delta > 0 ? 'girls-stats__up' : 'girls-stats__down'}>
                    {' '}{delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </span>
            </div>
            <div className="girls-stats__cell">
              <span className="girls-stats__num">{formatAvg(avg)}</span>
              <span className="girls-stats__cap">в среднем {week ? 'за неделю' : 'за месяц'}</span>
            </div>
            <div className="girls-stats__cell">
              <span className="girls-stats__num">{girls.length}</span>
              <span className="girls-stats__cap">всего, {withDates} со свиданиями</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
