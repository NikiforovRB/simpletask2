import { useEffect, useState } from 'react';
import { toLocalDateString } from '../constants';
import { MONTH_NOMINATIVE, formatDate, formatDateTime, formatRange, parseDay, todayStr } from '../lib/girls';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const TIME_PRESETS = ['18:00', '19:00', '20:00', '21:00'];

function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { day: toLocalDateString(d), num: d.getDate(), outside: d.getMonth() !== month };
  });
}

function Chevron({ dir }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/**
 * Calendar modal of the «Девушки» section.
 *
 * mode="single": `value` + optional `withTime`/`time`; `onApply({ date, time })`.
 *   Without time a click on a day applies right away.
 * mode="range": `from`/`to`; `onApply({ from, to })`, `onApply(null)` to reset.
 */
export function GirlsDatePicker({
  mode = 'single',
  title,
  value,
  time: initialTime = '',
  withTime = false,
  from: initialFrom = '',
  to: initialTo = '',
  quick = [],
  onApply,
  onClose,
}) {
  const today = todayStr();
  const anchor = (mode === 'range' ? initialFrom : value) || today;
  const [month, setMonth] = useState(() => {
    const d = parseDay(anchor);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [day, setDay] = useState(value || '');
  const [time, setTime] = useState(initialTime || '');
  const [range, setRange] = useState({ from: initialFrom, to: initialTo });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const showMonthOf = (s) => {
    const d = parseDay(s);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const shift = (delta) => {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const pick = (s) => {
    if (mode === 'range') {
      setRange((r) => {
        if (!r.from || r.to) return { from: s, to: '' };
        return s < r.from ? { from: s, to: r.from } : { from: r.from, to: s };
      });
      return;
    }
    if (!withTime) {
      onApply({ date: s, time: null });
      return;
    }
    setDay(s);
  };

  const pickQuick = (s) => {
    showMonthOf(s);
    pick(s);
  };

  const apply = () => {
    if (mode === 'range') {
      onApply(range.from ? { from: range.from, to: range.to || range.from } : null);
      return;
    }
    if (day) onApply({ date: day, time: time || null });
  };

  const cells = monthCells(month.y, month.m);
  const rangeTo = range.to || range.from;
  const summary =
    mode === 'range'
      ? range.from
        ? range.to
          ? formatRange(range.from, range.to)
          : `${formatDate(range.from)} — выберите конец`
        : 'Выберите начало периода'
      : day
        ? formatDateTime(day, time)
        : 'Выберите день';

  return (
    <div
      className="girl-picker__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="girl-picker" role="dialog" aria-modal="true" aria-label={title}>
        <header className="girl-picker__head">
          <span className="girl-picker__title">{title}</span>
          <button type="button" className="girl-picker__close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {(withTime || mode === 'range') && <div className="girl-picker__summary">{summary}</div>}

        {quick.length > 0 && (
          <div className="girl-picker__quick">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                className={`girl-picker__quick-btn ${(mode === 'range' ? range.from === q.value && !range.to : day === q.value) ? 'girl-picker__quick-btn--on' : ''}`}
                onClick={() => pickQuick(q.value)}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="girl-picker__nav">
          <button type="button" className="girl-picker__nav-btn" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
            <Chevron dir="left" />
          </button>
          <span className="girl-picker__month">
            {MONTH_NOMINATIVE[month.m]} {month.y}
          </span>
          <button type="button" className="girl-picker__nav-btn" onClick={() => shift(1)} aria-label="Следующий месяц">
            <Chevron dir="right" />
          </button>
        </div>

        <div className="girl-picker__grid" role="grid">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={`girl-picker__weekday ${i >= 5 ? 'girl-picker__weekday--end' : ''}`}>{w}</span>
          ))}
          {cells.map((c) => {
            const selected = mode === 'range' ? c.day === range.from || c.day === rangeTo : c.day === day;
            const between = mode === 'range' && range.from && rangeTo && c.day > range.from && c.day < rangeTo;
            const cls = [
              'girl-picker__day',
              c.outside && 'girl-picker__day--outside',
              c.day === today && 'girl-picker__day--today',
              selected && 'girl-picker__day--selected',
              between && 'girl-picker__day--between',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button key={c.day} type="button" className={cls} onClick={() => pick(c.day)} aria-label={formatDate(c.day)} aria-pressed={selected}>
                {c.num}
              </button>
            );
          })}
        </div>

        {withTime && mode === 'single' && (
          <div className="girl-picker__time">
            <span className="girl-picker__time-label">Время</span>
            <div className="girl-picker__time-row">
              <input
                type="time"
                className="girl-picker__time-input"
                value={time}
                step="300"
                onChange={(e) => setTime(e.target.value)}
                aria-label="Время"
              />
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`girl-picker__quick-btn ${time === t ? 'girl-picker__quick-btn--on' : ''}`}
                  onClick={() => setTime(t)}
                >
                  {t}
                </button>
              ))}
              {time && (
                <button type="button" className="girl-picker__quick-btn" onClick={() => setTime('')}>
                  Без времени
                </button>
              )}
            </div>
          </div>
        )}

        {(withTime || mode === 'range') && (
          <footer className="girl-picker__foot">
            {mode === 'range' && (initialFrom || range.from) && (
              <button type="button" className="girl-btn girl-btn--ghost" onClick={() => onApply(null)}>
                Сбросить
              </button>
            )}
            <span className="girl-editor__spacer" />
            <button
              type="button"
              className="girl-btn girl-btn--primary"
              onClick={apply}
              disabled={mode === 'range' ? !range.from : !day}
            >
              Готово
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
