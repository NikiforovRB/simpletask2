import { useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
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
const PILL_MODE_KEY = 'focus_pill_expanded';

function readPillExpanded() {
  try {
    return localStorage.getItem(PILL_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 3.5l7 4.5-7 4.5V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

export function FocusTimer() {
  const focus = useFocus();
  const [pillExpanded, setPillExpandedState] = useState(readPillExpanded);
  const setPillExpanded = (v) => {
    setPillExpandedState(v);
    try {
      localStorage.setItem(PILL_MODE_KEY, v ? '1' : '0');
    } catch {
      /* storage unavailable — the mode just won't persist */
    }
  };
  const {
    open, active, target, mode, phase, running,
    phaseElapsed, phaseTarget, phaseRemaining, workSeconds, cycles,
    pomoWork, pomoBreak,
    minimize, start, pause, stopAndClose, setMode, setPomoConfig, skipPhase, openFocus,
  } = focus;

  const isPomo = mode === 'pomodoro';

  // Minimized floating pill — shown when a session is active but the overlay
  // is closed, so the user can keep working and re-open it. Two shapes:
  // a compact pill and an expanded card with an hour dial under the timer.
  if (!open) {
    if (!active) return null;
    // The dial advances once a minute; CSS eases between the steps.
    const dialMinutes = isPomo && phaseTarget !== Infinity
      ? Math.min(Math.floor(phaseElapsed / 60), Math.round(phaseTarget / 60))
      : Math.floor((phaseElapsed % 3600) / 60);
    const dialTotal = isPomo && phaseTarget !== Infinity ? Math.max(1, Math.round(phaseTarget / 60)) : 60;
    const dialFraction = Math.min(1, dialMinutes / dialTotal);
    return (
      <div
        className={`focus-pill ${running ? 'focus-pill--running' : 'focus-pill--paused'}${pillExpanded ? ' focus-pill--expanded' : ''}`}
      >
        <div className="focus-pill__row">
          <button
            type="button"
            className="focus-pill__main"
            onClick={() => openFocus(target, mode)}
            aria-label="Открыть таймер фокуса"
          >
            <span className="focus-pill__dot" />
            <span className="focus-pill__time">
              {isPomo ? fmt(phaseRemaining ?? 0) : fmt(phaseElapsed)}
            </span>
            <span className="focus-pill__label">{isPomo && phase === 'break' ? 'перерыв' : 'фокус'}</span>
          </button>
          <button
            type="button"
            className="focus-pill__toggle"
            onClick={() => setPillExpanded(!pillExpanded)}
            aria-label={pillExpanded ? 'Компактный вид' : 'Развернуть циферблат'}
            title={pillExpanded ? 'Компактный вид' : 'Развернуть циферблат'}
          >
            <img src={pillExpanded ? downIcon : upIcon} alt="" />
          </button>
        </div>

        {pillExpanded && (
          <div className="focus-pill__dial-wrap">
            <svg className="focus-pill__dial" viewBox="0 0 100 100" width="104" height="104" aria-hidden>
              <circle className="focus-pill__dial-plate" cx="50" cy="50" r="47" />
              <circle
                className="focus-pill__dial-fill"
                cx="50"
                cy="50"
                r={DIAL_R}
                strokeWidth={DIAL_R * 2}
                strokeDasharray={DIAL_CIRC}
                strokeDashoffset={DIAL_CIRC * (1 - dialFraction)}
                transform="rotate(-90 50 50)"
              />
              <circle className="focus-pill__dial-ring" cx="50" cy="50" r="47" />
              {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => (
                <line
                  key={deg}
                  className={`focus-pill__dial-tick${deg % 90 === 0 ? ' focus-pill__dial-tick--major' : ''}`}
                  x1="50"
                  y1="6"
                  x2="50"
                  y2={deg % 90 === 0 ? 13 : 10}
                  transform={`rotate(${deg} 50 50)`}
                />
              ))}
            </svg>
            <button
              type="button"
              className="focus-pill__dial-stop"
              onClick={stopAndClose}
              aria-label="Завершить"
              title="Завершить"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>
        )}
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
          {!running ? (
            <button type="button" className="focus-card__btn focus-card__btn--primary" onClick={start}>
              <PlayIcon />
              {active ? 'Продолжить' : 'Старт'}
            </button>
          ) : (
            <button type="button" className="focus-card__btn focus-card__btn--primary" onClick={pause}>
              <PauseIcon />
              Пауза
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
