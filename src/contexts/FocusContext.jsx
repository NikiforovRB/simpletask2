import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useFocusSessions } from '../hooks/useFocusSessions';
import { showLocalNotification } from '../lib/reminders';

const FocusContext = createContext(null);

export const DEFAULT_POMODORO_WORK = 25;
export const DEFAULT_POMODORO_BREAK = 5;

const initialEngine = {
  mode: 'stopwatch', // 'stopwatch' | 'pomodoro'
  phase: 'work', // 'work' | 'break' (pomodoro only)
  running: false,
  phaseBaseSeconds: 0, // elapsed seconds in current phase before the last resume
  phaseStartTs: 0, // Date.now() of the last resume (0 when paused)
  workLoggedSeconds: 0, // completed work seconds (finished work phases)
  cycles: 0, // completed pomodoro work phases
  pomoWork: DEFAULT_POMODORO_WORK,
  pomoBreak: DEFAULT_POMODORO_BREAK,
  sessionStartedAt: null, // ISO of when the current session began
};

export function FocusProvider({ children }) {
  const { sessions, loading: sessionsLoading, logSession, deleteSession, updateSession } = useFocusSessions();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null); // { ref, title, source }
  const engineRef = useRef({ ...initialEngine });
  // A monotonically increasing counter we bump to force re-renders on tick.
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);
  const intervalRef = useRef(null);

  const phaseTargetSeconds = useCallback((eng) => {
    if (eng.mode !== 'pomodoro') return Infinity;
    return (eng.phase === 'work' ? eng.pomoWork : eng.pomoBreak) * 60;
  }, []);

  const liveElapsed = useCallback((eng) => {
    const live = eng.running && eng.phaseStartTs ? (Date.now() - eng.phaseStartTs) / 1000 : 0;
    return eng.phaseBaseSeconds + live;
  }, []);

  // Advance pomodoro phases when the running phase reaches its target.
  const maybeAdvancePhase = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.running || eng.mode !== 'pomodoro') return;
    const elapsed = liveElapsed(eng);
    const targetSecs = phaseTargetSeconds(eng);
    if (elapsed < targetSecs) return;
    if (eng.phase === 'work') {
      eng.workLoggedSeconds += targetSecs;
      eng.cycles += 1;
      eng.phase = 'break';
      showLocalNotification('Время отдохнуть', {
        body: `Вы отработали ${eng.pomoWork} мин. Перерыв ${eng.pomoBreak} мин.`,
        tag: 'focus-phase',
      });
    } else {
      eng.phase = 'work';
      showLocalNotification('Снова за работу', {
        body: 'Перерыв окончен — продолжаем фокус.',
        tag: 'focus-phase',
      });
    }
    eng.phaseBaseSeconds = 0;
    eng.phaseStartTs = Date.now();
  }, [liveElapsed, phaseTargetSeconds]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const eng = engineRef.current;
      if (eng.running) {
        maybeAdvancePhase();
        forceRender();
      }
    }, 250);
    return () => clearInterval(intervalRef.current);
  }, [maybeAdvancePhase, forceRender]);

  const openFocus = useCallback((nextTarget = null, mode = 'stopwatch') => {
    const eng = engineRef.current;
    // If a session is already running for the same target, just reveal it.
    const sameTarget =
      eng.sessionStartedAt &&
      target &&
      nextTarget &&
      target.ref === nextTarget.ref &&
      target.source === nextTarget.source;
    if (!sameTarget) {
      engineRef.current = {
        ...initialEngine,
        mode: mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
        pomoWork: eng.pomoWork,
        pomoBreak: eng.pomoBreak,
      };
      setTarget(nextTarget);
    }
    setOpen(true);
    forceRender();
  }, [forceRender, target]);

  const start = useCallback(() => {
    const eng = engineRef.current;
    if (eng.running) return;
    eng.running = true;
    eng.phaseStartTs = Date.now();
    if (!eng.sessionStartedAt) eng.sessionStartedAt = new Date().toISOString();
    forceRender();
  }, [forceRender]);

  const pause = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.running) return;
    eng.phaseBaseSeconds = liveElapsed(eng);
    eng.running = false;
    eng.phaseStartTs = 0;
    forceRender();
  }, [forceRender, liveElapsed]);

  // Total work seconds accrued this session (for logging): completed work
  // phases + current work-phase partial (stopwatch counts everything as work).
  const computeWorkSeconds = useCallback(() => {
    const eng = engineRef.current;
    if (eng.mode === 'stopwatch') return Math.round(liveElapsed(eng));
    const partial = eng.phase === 'work' ? liveElapsed(eng) : 0;
    return Math.round(eng.workLoggedSeconds + partial);
  }, [liveElapsed]);

  // Stop the session: log accrued work time, then reset the engine.
  const stopAndLog = useCallback(async () => {
    const eng = engineRef.current;
    const workSeconds = computeWorkSeconds();
    const startedAt = eng.sessionStartedAt;
    const mode = eng.mode;
    engineRef.current = {
      ...initialEngine,
      mode,
      pomoWork: eng.pomoWork,
      pomoBreak: eng.pomoBreak,
    };
    forceRender();
    if (workSeconds >= 1 && startedAt) {
      await logSession({
        taskRef: target?.ref ?? null,
        taskTitle: target?.title ?? 'Фокус без задачи',
        source: target?.source ?? 'custom',
        mode,
        durationSeconds: workSeconds,
        startedAt,
        endedAt: new Date().toISOString(),
      });
    }
    return workSeconds;
  }, [computeWorkSeconds, forceRender, logSession, target]);

  const stopAndClose = useCallback(async () => {
    await stopAndLog();
    setOpen(false);
    setTarget(null);
  }, [stopAndLog]);

  // Hide the overlay but keep the session running in the background.
  const minimize = useCallback(() => setOpen(false), []);

  const setMode = useCallback((mode) => {
    const eng = engineRef.current;
    if (eng.sessionStartedAt) return; // don't switch mid-session
    eng.mode = mode === 'pomodoro' ? 'pomodoro' : 'stopwatch';
    eng.phase = 'work';
    forceRender();
  }, [forceRender]);

  const setPomoConfig = useCallback(({ work, brk }) => {
    const eng = engineRef.current;
    if (Number.isFinite(work)) eng.pomoWork = Math.max(1, Math.min(120, Math.round(work)));
    if (Number.isFinite(brk)) eng.pomoBreak = Math.max(1, Math.min(60, Math.round(brk)));
    forceRender();
  }, [forceRender]);

  const skipPhase = useCallback(() => {
    const eng = engineRef.current;
    if (eng.mode !== 'pomodoro') return;
    if (eng.phase === 'work') {
      eng.workLoggedSeconds += liveElapsed(eng);
      eng.cycles += 1;
      eng.phase = 'break';
    } else {
      eng.phase = 'work';
    }
    eng.phaseBaseSeconds = 0;
    eng.phaseStartTs = eng.running ? Date.now() : 0;
    forceRender();
  }, [forceRender, liveElapsed]);

  const eng = engineRef.current;
  const phaseElapsed = liveElapsed(eng);
  const phaseTarget = phaseTargetSeconds(eng);

  const value = {
    open,
    target,
    mode: eng.mode,
    phase: eng.phase,
    running: eng.running,
    active: !!eng.sessionStartedAt,
    phaseElapsed,
    phaseTarget,
    phaseRemaining: phaseTarget === Infinity ? null : Math.max(0, phaseTarget - phaseElapsed),
    workSeconds: computeWorkSeconds(),
    cycles: eng.cycles,
    pomoWork: eng.pomoWork,
    pomoBreak: eng.pomoBreak,
    openFocus,
    minimize,
    start,
    pause,
    stopAndLog,
    stopAndClose,
    setMode,
    setPomoConfig,
    skipPhase,
    // Session data + mutations (single source of truth for the analytics page).
    sessions,
    sessionsLoading,
    deleteSession,
    updateSession,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error('useFocus must be used within FocusProvider');
  return ctx;
}
