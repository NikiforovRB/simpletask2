import { useEffect, useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { toLocalDateString } from '../constants';
import playIcon from '../assets/play.svg';
import playNavIcon from '../assets/play-nav.svg';
import './TodayFocusTotal.css';

const QUICK_SESSION_TITLE = 'Работа';

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} сек`;
}

/**
 * Today's focus total for the section headers that carry it. Hidden when nothing
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

/**
 * One-tap start of a plain «Работа» focus session. Hidden while a session is
 * already running; on desktop it only appears when the header is hovered.
 */
export function FocusQuickStart() {
  const { active, startQuick } = useFocus();
  const [hover, setHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');

  if (active) return null;

  return (
    <button
      type="button"
      className="focus-quick"
      onMouseEnter={() => hasHover && setHover(true)}
      onMouseLeave={() => hasHover && setHover(false)}
      onClick={() => startQuick({ ref: null, title: QUICK_SESSION_TITLE, source: 'custom' }, 'stopwatch')}
      aria-label={`Запустить фокус-сессию «${QUICK_SESSION_TITLE}»`}
      title={`Фокус: ${QUICK_SESSION_TITLE}`}
    >
      <img src={hasHover && hover ? playNavIcon : playIcon} alt="" />
    </button>
  );
}
