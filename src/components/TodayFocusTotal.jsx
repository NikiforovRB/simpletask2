import { useEffect, useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
import { toLocalDateString } from '../constants';
import './TodayFocusTotal.css';

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} сек`;
}

/**
 * Today's focus total for the Plans / Calendar headers. Hidden when nothing
 * was tracked today; a running session is counted live, snapped to whole
 * minutes so the number only changes once a minute.
 */
export function TodayFocusTotal({ onOpen }) {
  const { sessions, active, workSeconds } = useFocus();
  const [, setMinuteTick] = useState(0);

  // Keeps the value fresh once a minute even when nothing else re-renders
  // (running session ticking over, or the date rolling past midnight).
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((t) => (t + 1) % 1440), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const todayDs = toLocalDateString(new Date());

  let total = 0;
  for (const s of sessions || []) {
    const d = new Date(s.started_at);
    if (Number.isNaN(d.getTime())) continue;
    if (toLocalDateString(d) === todayDs) total += s.duration_seconds || 0;
  }
  if (active && workSeconds >= 60) total += Math.floor(workSeconds / 60) * 60;

  if (total < 1) return null;

  return (
    <button
      type="button"
      className="focus-total"
      onClick={onOpen}
      title="Аналитика фокус-сессий"
    >
      <span className="focus-total__label">Сегодня</span>
      <span className="focus-total__value">{fmtDuration(total)}</span>
    </button>
  );
}
