import { useMemo, useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
import { toLocalDateString } from '../constants';
import upIcon from '../assets/up.svg';
import downIcon from '../assets/down.svg';
import './FocusTimer.css';

function fmt(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const RADIUS = 130;
const CIRC = 2 * Math.PI * RADIUS;

// Minimized dial: a pie drawn as a thick-stroked circle (r = half the radius,
// stroke-width = the full radius), so the dash offset sweeps a filled sector.
const DIAL_R = 23.5;
const DIAL_CIRC = 2 * Math.PI * DIAL_R;
// Minimized shapes, cycled by the small toggle: a compact pill, a card with
// the hour dial, and oversized digits only.
const PILL_MODES = ['compact', 'dial', 'digits'];
const PILL_MODE_KEY = 'focus_pill_mode';
const LEGACY_PILL_MODE_KEY = 'focus_pill_expanded';
const DIAL_PLATE_COLOR = '#2e2e32';
// One shade per hour of the session: the sweeping sector uses the current
// hour's colour, while the already completed hour stays behind it as the plate.
const DIAL_HOUR_COLORS = ['#5a86ee', '#3e65c2', '#264794', '#17306b'];

function readPillMode() {
  try {
    const stored = localStorage.getItem(PILL_MODE_KEY);
    if (PILL_MODES.includes(stored)) return stored;
    return localStorage.getItem(LEGACY_PILL_MODE_KEY) === '1' ? 'dial' : 'compact';
  } catch {
    return 'compact';
  }
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 3.5l7 4.5-7 4.5V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.75" y="3.75" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Stop, revealed on hover over a minimized timer so a session can be finished
 * without opening the overlay. A running session is only ever stopped — there
 * is no pausing, so its logged time always matches the clock.
 */
function PillActions({ onStop }) {
  return (
    <div className="focus-pill__actions">
      <button
        type="button"
        className="focus-pill__action"
        onClick={onStop}
        aria-label="Завершить"
        title="Завершить"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

export function FocusTimer({ showTodayTotal = false }) {
  const focus = useFocus();
  const [pillMode, setPillModeState] = useState(readPillMode);
  const cyclePillMode = () => {
    const next = PILL_MODES[(PILL_MODES.indexOf(pillMode) + 1) % PILL_MODES.length];
    setPillModeState(next);
    try {
      localStorage.setItem(PILL_MODE_KEY, next);
    } catch {
      /* storage unavailable — the mode just won't persist */
    }
  };
  const {
    open, active, target, mode, phase,
    phaseElapsed, phaseTarget, phaseRemaining, workSeconds, cycles,
    pomoWork, pomoBreak, sessions,
    minimize, start, stopAndClose, setMode, setPomoConfig, skipPhase, openFocus,
  } = focus;

  const isPomo = mode === 'pomodoro';

  // Focus time already logged today, for the "today's total" display mode.
  const loggedTodaySeconds = useMemo(() => {
    if (!showTodayTotal) return 0;
    const today = toLocalDateString(new Date());
    let total = 0;
    for (const s of sessions || []) {
      const d = new Date(s.started_at);
      if (Number.isNaN(d.getTime())) continue;
      if (toLocalDateString(d) === today) total += s.duration_seconds || 0;
    }
    return total;
  }, [showTodayTotal, sessions]);

  // Minimized floating pill — shown when a session is active but the overlay
  // is closed, so the user can keep working and re-open it. Three shapes:
  // a compact pill, a card with the hour dial, and oversized digits.
  if (!open) {
    if (!active) return null;
    const isDial = pillMode === 'dial';
    const isDigits = pillMode === 'digits';
    // Either the running session, or everything focused on today so far.
    const totalSeconds = loggedTodaySeconds + workSeconds;
    const shownSeconds = showTodayTotal
      ? totalSeconds
      : (isPomo ? (phaseRemaining ?? 0) : phaseElapsed);
    // The dial advances once a minute; CSS eases between the steps.
    const dialSource = showTodayTotal ? totalSeconds : phaseElapsed;
    const dialByPhase = isPomo && phaseTarget !== Infinity && !showTodayTotal;
    const dialMinutes = dialByPhase
      ? Math.min(Math.floor(dialSource / 60), Math.round(phaseTarget / 60))
      : Math.floor((dialSource % 3600) / 60);
    const dialTotal = dialByPhase ? Math.max(1, Math.round(phaseTarget / 60)) : 60;
    const dialFraction = Math.min(1, dialMinutes / dialTotal);
    // Pomodoro phases never run past an hour, so they always use the first shade.
    const dialHour = dialByPhase ? 0 : Math.floor(dialSource / 3600);
    const lastShade = DIAL_HOUR_COLORS.length - 1;
    const dialFillColor = DIAL_HOUR_COLORS[Math.min(dialHour, lastShade)];
    const dialPlateColor = dialHour > 0 ? DIAL_HOUR_COLORS[Math.min(dialHour - 1, lastShade)] : DIAL_PLATE_COLOR;
    const pillLabel = showTodayTotal
      ? 'сегодня'
      : (isPomo && phase === 'break' ? 'перерыв' : 'фокус');
    return (
      <div
        className={`focus-pill focus-pill--running${isDial ? ' focus-pill--expanded' : ''}${isDigits ? ' focus-pill--digits' : ''}`}
      >
        <div className="focus-pill__row">
          <button
            type="button"
            className="focus-pill__main"
            onClick={() => openFocus(target, mode)}
            aria-label="Открыть таймер фокуса"
            title={showTodayTotal ? 'Всего за сегодня' : undefined}
          >
            {!isDigits && <span className="focus-pill__dot" />}
            <span className="focus-pill__time">{fmt(shownSeconds)}</span>
            {!isDigits && <span className="focus-pill__label">{pillLabel}</span>}
          </button>
          <button
            type="button"
            className="focus-pill__toggle"
            onClick={cyclePillMode}
            aria-label="Другой вид таймера"
            title="Другой вид таймера"
          >
            <img src={isDigits ? downIcon : upIcon} alt="" />
          </button>
        </div>

        {isDial && (
          <div className="focus-pill__dial-wrap">
            <svg className="focus-pill__dial" viewBox="0 0 100 100" width="104" height="104" aria-hidden>
              <circle className="focus-pill__dial-plate" cx="50" cy="50" r="47" fill={dialPlateColor} />
              <circle
                className="focus-pill__dial-fill"
                cx="50"
                cy="50"
                r={DIAL_R}
                stroke={dialFillColor}
                strokeWidth={DIAL_R * 2}
                strokeDasharray={DIAL_CIRC}
                strokeDashoffset={DIAL_CIRC * (1 - dialFraction)}
                transform="rotate(-90 50 50)"
              />
              <circle className="focus-pill__dial-ring" cx="50" cy="50" r="47" />
              {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => (
                <line
                  key={deg}
                  className="focus-pill__dial-tick"
                  x1="50"
                  y1="6"
                  x2="50"
                  y2="12"
                  transform={`rotate(${deg} 50 50)`}
                />
              ))}
            </svg>
            <PillActions onStop={stopAndClose} />
          </div>
        )}

        {isDigits && <PillActions onStop={stopAndClose} />}
      </div>
    );
  }

  const ringProgress = isPomo
    ? Math.min(1, phaseTarget ? phaseElapsed / phaseTarget : 0)
    : (phaseElapsed % 3600) / 3600; // stopwatch: sweep fills over one hour
  const dashOffset = CIRC * (1 - ringProgress);
  const centerTime = isPomo ? fmt(phaseRemaining ?? 0) : fmt(phaseElapsed);

  return (
    <div className="focus-overlay" role="dialog" aria-modal="true">
      <div className="focus-overlay__backdrop" onClick={minimize} />
      <div className={`focus-card ${isPomo && phase === 'break' ? 'focus-card--break' : ''}`}>
        <button type="button" className="focus-card__minimize" onClick={minimize} aria-label="Свернуть" title="Свернуть">
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="focus-card__task" title={target?.title || 'Фокус без задачи'}>
          {target?.title || 'Фокус без задачи'}
        </div>

        {!active && (
          <div className="focus-card__mode-toggle" role="tablist">
            <span className={`focus-card__mode-indicator focus-card__mode-indicator--${isPomo ? 'pomo' : 'watch'}`} aria-hidden />
            <button
              type="button"
              className={`focus-card__mode-opt ${!isPomo ? 'focus-card__mode-opt--active' : ''}`}
              onClick={() => setMode('stopwatch')}
            >
              Секундомер
            </button>
            <button
              type="button"
              className={`focus-card__mode-opt ${isPomo ? 'focus-card__mode-opt--active' : ''}`}
              onClick={() => setMode('pomodoro')}
            >
              Помодоро
            </button>
          </div>
        )}

        <div className="focus-card__ring-wrap">
          <svg className="focus-card__ring" width="300" height="300" viewBox="0 0 300 300">
            <circle className="focus-card__ring-track" cx="150" cy="150" r={RADIUS} />
            <circle
              className="focus-card__ring-progress"
              cx="150"
              cy="150"
              r={RADIUS}
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              style={{ strokeDashoffset: dashOffset }}
            />
          </svg>
          <div className="focus-card__center">
            {isPomo && (
              <div className={`focus-card__phase focus-card__phase--${phase}`}>
                {phase === 'work' ? 'Фокус' : 'Перерыв'}
              </div>
            )}
            <div className="focus-card__time">{centerTime}</div>
            <div className="focus-card__sub">
              {isPomo ? `Циклов: ${cycles}` : `Всего: ${fmt(workSeconds)}`}
            </div>
          </div>
        </div>

        {isPomo && !active && (
          <div className="focus-card__pomo-config">
            <label className="focus-card__cfg">
              Работа
              <input
                type="number"
                min="1"
                max="120"
                value={pomoWork}
                onChange={(e) => setPomoConfig({ work: parseInt(e.target.value, 10) })}
              />
              мин
            </label>
            <label className="focus-card__cfg">
              Перерыв
              <input
                type="number"
                min="1"
                max="60"
                value={pomoBreak}
                onChange={(e) => setPomoConfig({ brk: parseInt(e.target.value, 10) })}
              />
              мин
            </label>
          </div>
        )}

        <div className="focus-card__controls">
          {!active && (
            <button type="button" className="focus-card__btn focus-card__btn--primary" onClick={start}>
              <PlayIcon />
              Старт
            </button>
          )}
          {isPomo && active && (
            <button type="button" className="focus-card__btn focus-card__btn--ghost" onClick={skipPhase}>
              {phase === 'work' ? 'Пропустить' : 'К работе'}
            </button>
          )}
          {active && (
            <button type="button" className="focus-card__btn focus-card__btn--stop" onClick={stopAndClose}>
              <StopIcon />
              Завершить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
