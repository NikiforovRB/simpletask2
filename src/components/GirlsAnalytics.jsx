import { useMemo, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import {
  DATE_PRESETS,
  MONTH_NOMINATIVE,
  STATS_MODES,
  addDays,
  filterRange,
  formatRange,
  funnelByPeriod,
  funnelOf,
  inRange,
  parseDay,
  percent,
  plural,
} from '../lib/girls';
import { GirlsDatePicker } from './GirlsDatePicker';

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);

function periodLabel(row, index, mode) {
  if (index === 0) return mode === 'month' ? 'Этот месяц' : 'Эта неделя';
  if (mode === 'week') return formatRange(row.from, row.to);
  const d = parseDay(row.from);
  return `${MONTH_NOMINATIVE[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** «Подходы → Знакомства → Свидания»: the funnel of a period and by weeks / months. */
export function GirlsAnalytics({ approaches, approachesReady, girls, today, initialFilter, mode, onMode, onClose }) {
  const [filter, setFilter] = useState(initialFilter);
  const [picker, setPicker] = useState(false);
  useModalClose(onClose);

  const range = filterRange(filter, today);
  const girlsById = useMemo(() => new Map(girls.map((g) => [g.id, g])), [girls]);
  const f = funnelOf(approaches, girlsById, range);
  const rows = useMemo(() => funnelByPeriod(approaches, girlsById, mode, today), [approaches, girlsById, mode, today]);
  const linked = new Set(approaches.map((a) => a.girl_id).filter(Boolean));
  const withoutApproach = girls.filter((g) => !linked.has(g.id) && inRange(g.met_on, range)).length;
  const setRange = (r) => setFilter(r ? { key: 'range', from: r.from, to: r.to } : { key: 'all' });

  const steps = [
    { key: 'approaches', label: 'Подходы', value: f.approaches },
    { key: 'contacts', label: 'Знакомства', value: f.contacts, rate: percent(f.contacts, f.approaches), of: 'от подходов' },
    { key: 'dates', label: 'Свидания', value: f.dates, rate: percent(f.dates, f.contacts), of: 'от знакомств' },
  ];

  return (
    <div
      className="girl-editor__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="girl-editor girls-funnel" role="dialog" aria-modal="true" aria-label="Конверсия">
        <header className="girl-editor__head">
          <span className="girl-editor__title">Подходы → Знакомства → Свидания</span>
          <button type="button" className="girl-editor__close" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>

        <div className="girl-editor__body">
          {!approachesReady ? (
            <p className="girls-funnel__empty">
              Подходы пока негде хранить: примените миграцию <code>067_girl_approaches.sql</code> в Supabase.
            </p>
          ) : approaches.length === 0 ? (
            <p className="girls-funnel__empty">
              Подходов пока нет. Отмечайте их во вкладке «Подходы» (отказ или контакт) — здесь появится конверсия.
            </p>
          ) : (
            <>
              <div className="girls__chips girls-funnel__chips" role="group" aria-label="Период">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`girls__chip ${filter.key === p.key ? 'girls__chip--on' : ''}`}
                    onClick={() => setFilter({ key: p.key })}
                  >
                    {p.label}
                  </button>
                ))}
                {filter.key === 'range' ? (
                  <span className="girls__chip girls__chip--on girls__chip--range">
                    <button type="button" className="girls__chip-main" onClick={() => setPicker(true)}>
                      <CalendarIcon />
                      {formatRange(range.from, range.to)}
                    </button>
                    <button type="button" className="girls__chip-clear" onClick={() => setRange(null)} aria-label="Сбросить период">
                      <CloseIcon />
                    </button>
                  </span>
                ) : (
                  <button type="button" className="girls__chip" onClick={() => setPicker(true)}>
                    <CalendarIcon />
                    Период
                  </button>
                )}
              </div>

              <div className="girls-funnel__steps">
                {steps.map((s) => (
                  <div key={s.key} className={`girls-funnel__step girls-funnel__step--${s.key}`}>
                    <span className="girls-funnel__label">{s.label}</span>
                    <span className="girls-funnel__track">
                      <span
                        className="girls-funnel__fill"
                        style={{ width: f.approaches ? `${Math.max(s.value ? 3 : 0, (s.value / f.approaches) * 100)}%` : 0 }}
                      />
                    </span>
                    <span className="girls-funnel__value">{s.value}</span>
                    <span className="girls-funnel__rate" title={s.of ? `${s.rate} ${s.of}` : undefined}>
                      {s.rate ?? ''}
                    </span>
                  </div>
                ))}
              </div>

              <p className="girls-funnel__note">
                {f.approaches === 0
                  ? 'В этом периоде подходов не было.'
                  : `${f.refusals} ${plural(f.refusals, 'отказ', 'отказа', 'отказов')} · до свидания дошли ${percent(f.dates, f.approaches)} подходов`}
                {withoutApproach > 0 &&
                  ` · ещё ${withoutApproach} ${plural(withoutApproach, 'знакомство', 'знакомства', 'знакомств')} без подхода не учтено`}
              </p>

              <div className="girls-funnel__table-head">
                <span className="girl-editor__section-title">По периодам</span>
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
              </div>

              <div className="girls-funnel__table">
                <div className="girls-funnel__row girls-funnel__row--head" aria-hidden="true">
                  <span>Период</span>
                  <span>Подходы</span>
                  <span>Знакомства</span>
                  <span>Свидания</span>
                </div>
                {rows.map((r, i) => {
                  const active = range && range.from === r.from && range.to === r.to;
                  return (
                    <button
                      key={r.from}
                      type="button"
                      className={`girls-funnel__row ${active ? 'girls-funnel__row--active' : ''} ${r.approaches ? '' : 'girls-funnel__row--empty'}`}
                      onClick={() => setRange(active ? null : { from: r.from, to: r.to })}
                      aria-pressed={!!active}
                      aria-label={`${formatRange(r.from, r.to)}: подходов ${r.approaches}, знакомств ${r.contacts}, свиданий ${r.dates}`}
                    >
                      <span className="girls-funnel__period">{periodLabel(r, i, mode)}</span>
                      <span>{r.approaches || '—'}</span>
                      <span>
                        {r.approaches ? r.contacts : '—'}
                        {r.approaches > 0 && <small>{percent(r.contacts, r.approaches)}</small>}
                      </span>
                      <span>
                        {r.approaches ? r.dates : '—'}
                        {r.contacts > 0 && <small>{percent(r.dates, r.contacts)}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="girl-editor__hint">
                Свидания считаются по знакомствам из подходов этого периода, когда бы ни было само свидание.
              </p>
            </>
          )}
        </div>
      </div>

      {picker && (
        <GirlsDatePicker
          mode="range"
          title="Период подходов"
          from={range?.from || ''}
          to={range?.to || ''}
          quick={[
            { label: 'Сегодня', value: today },
            { label: 'Вчера', value: addDays(today, -1) },
          ]}
          onApply={(r) => {
            setRange(r);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
