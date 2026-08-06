import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useFocusSessions } from '../hooks/useFocusSessions';
import { showLocalNotification } from '../lib/reminders';

const FocusContext = createContext(null);

export const DEFAULT_POMODORO_WORK = 25;
export const DEFAULT_POMODORO_BREAK = 5;

// How often the running session refreshes its heartbeat in the database.
const HEARTBEAT_MS = 30 * 1000;
// A running session whose heartbeat is older than this was abandoned (browser
// closed, device asleep): on the next load it is logged up to its last
// heartbeat instead of silently swallowing the whole gap.
const STALE_MS = 30 * 60 * 1000;
// Resuming a session that has been paused for longer than this starts a new
// one. Otherwise a session forgotten in the paused state would be logged as
// having spanned every hour until the day it is resumed.
const RESUME_GAP_MS = 15 * 60 * 1000;

const newSessionId = () => (
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
);

const initialEngine = {
  sessionId: null, // identifies this run across devices
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
  lastWorkTs: 0, // Date.now() of the last moment the timer was counting
};

/** Work seconds a stored active-session row had accrued at `endMs`. */
function rowWorkSeconds(row, endMs) {
  const live = row.running && row.phase_start_at
    ? Math.max(0, (endMs - new Date(row.phase_start_at).getTime()) / 1000)
    : 0;
  let phaseElapsed = (row.phase_base_seconds || 0) + live;
  if (row.mode === 'stopwatch') return Math.round(phaseElapsed);
  const phaseTarget = (row.phase === 'work' ? row.pomo_work : row.pomo_break) * 60;
  phaseElapsed = Math.min(phaseElapsed, phaseTarget);
  return Math.round((row.work_logged_seconds || 0) + (row.phase === 'work' ? phaseElapsed : 0));
}

export function FocusProvider({ children }) {
  const { user } = useAuth();
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

  // Writes to the active-session row are queued so that a delete issued on stop
  // can never be overtaken by an in-flight upsert (which would resurrect it).
  // `updated_at` stamps we have written ourselves, so the realtime echo of our
  // own upserts can be told apart from a change made on another device.
  const ownWritesRef = useRef([]);
  const writeChainRef = useRef(Promise.resolve());
  const enqueueWrite = useCallback((fn) => {
    const run = () => Promise.resolve().then(fn).catch(() => {});
    writeChainRef.current = writeChainRef.current.then(run, run);
    return writeChainRef.current;
  }, []);

  // Drop the local session without logging it: whoever removed the row has
  // already written the finished session.
  const dropLocalSession = useCallback(() => {
    if (!engineRef.current.sessionStartedAt) return;
    const eng = engineRef.current;
    engineRef.current = {
      ...initialEngine,
      mode: eng.mode,
      pomoWork: eng.pomoWork,
      pomoBreak: eng.pomoBreak,
    };
    setOpen(false);
    setTarget(null);
    forceRender();
  }, [forceRender]);

  // Mirror the live session into the database so a page reload can pick it up.
  // `targetOverride` lets a caller persist a target it has just set, before the
  // corresponding state update has been applied.
  const persistedIdRef = useRef(null);
  const persistActive = useCallback((targetOverride) => {
    const eng = engineRef.current;
    if (!user?.id || !eng.sessionStartedAt) return Promise.resolve();
    const t = targetOverride === undefined ? target : targetOverride;
    const stamp = new Date().toISOString();
    // Compared as epoch ms: the database echoes the timestamp back in its own
    // textual format, so the strings themselves don't match.
    ownWritesRef.current.push(Date.parse(stamp));
    if (ownWritesRef.current.length > 10) ownWritesRef.current.shift();
    const row = {
      user_id: user.id,
      session_id: eng.sessionId,
      mode: eng.mode,
      phase: eng.phase,
      running: eng.running,
      phase_base_seconds: eng.phaseBaseSeconds,
      phase_start_at: eng.running && eng.phaseStartTs ? new Date(eng.phaseStartTs).toISOString() : null,
      work_logged_seconds: eng.workLoggedSeconds,
      cycles: eng.cycles,
      pomo_work: eng.pomoWork,
      pomo_break: eng.pomoBreak,
      session_started_at: eng.sessionStartedAt,
      target_ref: t?.ref ?? null,
      target_title: t?.title ?? null,
      target_source: t?.source ?? null,
      last_seen_at: stamp,
      updated_at: stamp,
    };
    // Only the first write of a session may create the row. Later writes patch
    // it by id, so a device that missed the stop can't resurrect the session —
    // it finds nothing to update and lets go of it instead.
    const isFirst = persistedIdRef.current !== eng.sessionId;
    persistedIdRef.current = eng.sessionId;
    const upsert = () => supabase.from('focus_active_sessions').upsert(row, { onConflict: 'user_id' });
    return enqueueWrite(async () => {
      if (isFirst || !eng.sessionId) return upsert();
      const { data, error } = await supabase
        .from('focus_active_sessions')
        .update(row)
        .eq('user_id', user.id)
        .eq('session_id', eng.sessionId)
        .select('user_id');
      if (error) return upsert(); // session_id column not migrated yet
      // Nothing to patch: the session was finished elsewhere. Only let go if we
      // are still on that same session.
      if (!data?.length && engineRef.current.sessionId === eng.sessionId) dropLocalSession();
      return undefined;
    });
  }, [user?.id, target, enqueueWrite, dropLocalSession]);

  /**
   * Removes the active-session row, but only while it still describes the run
   * we are stopping. Resolves to false when another device had already stopped
   * (and logged) it, so we must not write a second, overlapping entry.
   */
  const claimStop = useCallback((sessionId, startedAt) => {
    if (!user?.id) return Promise.resolve(true);
    return enqueueWrite(async () => {
      try {
        let q = supabase.from('focus_active_sessions').delete().eq('user_id', user.id);
        if (sessionId) q = q.eq('session_id', sessionId);
        const { data, error } = await q.select('user_id');
        // Before the session_id migration is applied the filter errors out; fall
        // back to an unconditional delete so stopping still works.
        if (error) {
          await supabase.from('focus_active_sessions').delete().eq('user_id', user.id);
          return true;
        }
        if (data?.length) return true;
        // Our run was not there. Either another device stopped it, or the row
        // belongs to a run we never adopted — and a leftover row is worse than
        // no row: the next page load would recover it as an abandoned session
        // overlapping the work we are logging right now. Drop it unless it is
        // newer than us, in which case it is a session someone just started.
        const { data: leftover } = await supabase
          .from('focus_active_sessions')
          .select('session_started_at')
          .eq('user_id', user.id)
          .maybeSingle();
        const leftoverMs = leftover ? Date.parse(leftover.session_started_at) : NaN;
        const ourMs = Date.parse(startedAt);
        if (Number.isFinite(leftoverMs) && (!Number.isFinite(ourMs) || leftoverMs <= ourMs)) {
          await supabase.from('focus_active_sessions').delete().eq('user_id', user.id);
        }
        return false;
      } catch {
        return true; // network trouble: better to log the work than to lose it
      }
    });
  }, [user?.id, enqueueWrite]);

  // Advance pomodoro phases when the running phase reaches its target. Phases
  // are chained on their real end time, so a session that ran while the tab was
  // closed catches up correctly instead of losing the overflow.
  const maybeAdvancePhase = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.running || eng.mode !== 'pomodoro') return false;
    let advanced = false;
    for (let guard = 0; guard < 500; guard++) {
      const elapsed = liveElapsed(eng);
      const targetSecs = phaseTargetSeconds(eng);
      if (elapsed < targetSecs) break;
      const phaseEndTs = eng.phaseStartTs + (targetSecs - eng.phaseBaseSeconds) * 1000;
      if (eng.phase === 'work') {
        eng.workLoggedSeconds += targetSecs;
        eng.cycles += 1;
        eng.phase = 'break';
        if (!advanced) {
          showLocalNotification('Время отдохнуть', {
            body: `Вы отработали ${eng.pomoWork} мин. Перерыв ${eng.pomoBreak} мин.`,
            tag: 'focus-phase',
          });
        }
      } else {
        eng.phase = 'work';
        if (!advanced) {
          showLocalNotification('Снова за работу', {
            body: 'Перерыв окончен — продолжаем фокус.',
            tag: 'focus-phase',
          });
        }
      }
      eng.phaseBaseSeconds = 0;
      eng.phaseStartTs = phaseEndTs;
      advanced = true;
    }
    return advanced;
  }, [liveElapsed, phaseTargetSeconds]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const eng = engineRef.current;
      if (eng.running) {
        if (maybeAdvancePhase()) persistActive();
        forceRender();
      }
    }, 250);
    return () => clearInterval(intervalRef.current);
  }, [maybeAdvancePhase, forceRender, persistActive]);

  // Heartbeat: proves the session is still being watched by a live tab.
  useEffect(() => {
    const id = setInterval(() => {
      const eng = engineRef.current;
      if (eng.sessionStartedAt && eng.running) persistActive();
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [persistActive]);

  // Adopt the session described by an active-session row (page load, or a
  // session started/paused on another device).
  const applyRemoteRow = useCallback((row) => {
    engineRef.current = {
      sessionId: row.session_id || null,
      mode: row.mode,
      phase: row.phase,
      running: row.running,
      phaseBaseSeconds: row.phase_base_seconds || 0,
      phaseStartTs: row.running && row.phase_start_at ? new Date(row.phase_start_at).getTime() : 0,
      workLoggedSeconds: row.work_logged_seconds || 0,
      cycles: row.cycles || 0,
      pomoWork: row.pomo_work || DEFAULT_POMODORO_WORK,
      pomoBreak: row.pomo_break || DEFAULT_POMODORO_BREAK,
      sessionStartedAt: row.session_started_at,
      // A running session is counting right now; a paused one last counted when
      // it was written, which is the moment it was paused.
      lastWorkTs: row.running
        ? Date.now()
        : (Date.parse(row.updated_at || row.last_seen_at) || Date.now()),
    };
    setTarget(row.target_ref || row.target_title
      ? { ref: row.target_ref, title: row.target_title, source: row.target_source }
      : null);
    forceRender();
  }, [forceRender]);

  // Keep every open device on the same session.
  useEffect(() => {
    if (!user?.id) return undefined;
    const ch = supabase
      .channel(`focus_active_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_active_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.session_id;
            const mine = engineRef.current.sessionId;
            if (oldId && mine && oldId !== mine) return;
            dropLocalSession();
            return;
          }
          const row = payload.new;
          if (!row) return;
          if (ownWritesRef.current.includes(Date.parse(row.updated_at))) return; // our own write
          applyRemoteRow(row);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, applyRemoteRow, dropLocalSession]);

  // Restore a session that was running when the page was last closed.
  const hydratedForRef = useRef(null);
  useEffect(() => {
    // No cleanup on purpose: the guard below is what keeps this to one run, and
    // aborting on unmount would skip hydration entirely under StrictMode (which
    // mounts, unmounts and mounts again), leaving stale rows behind.
    if (!user?.id || hydratedForRef.current === user.id) return;
    hydratedForRef.current = user.id;
    const userId = user.id;
    (async () => {
      const { data, error } = await supabase
        .from('focus_active_sessions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error || !data) return;
      // Don't clobber a session the user has already started in this tab.
      if (engineRef.current.sessionStartedAt) return;

      const lastSeen = new Date(data.last_seen_at).getTime();
      const abandoned = data.running && Date.now() - lastSeen > STALE_MS;
      if (abandoned) {
        // Log the work up to the last heartbeat — but only over a stretch that
        // holds no finished sessions yet. Two sessions can never run at once,
        // so an overlap means this run was already stopped somewhere else and
        // counting it again would inflate the totals.
        const { data: latest } = await supabase
          .from('focus_sessions')
          .select('ended_at')
          .eq('user_id', userId)
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const loggedUntil = latest?.ended_at ? Date.parse(latest.ended_at) : NaN;
        const startMs = Math.max(
          Date.parse(data.session_started_at) || 0,
          Number.isFinite(loggedUntil) ? loggedUntil : 0,
        );
        const seconds = Math.min(
          rowWorkSeconds(data, lastSeen),
          Math.max(0, (lastSeen - startMs) / 1000),
        );
        if (seconds >= 60) {
          await logSession({
            taskRef: data.target_ref ?? null,
            taskTitle: data.target_title || 'Фокус без задачи',
            source: data.target_source || 'custom',
            mode: data.mode,
            durationSeconds: seconds,
            startedAt: new Date(startMs).toISOString(),
            endedAt: new Date(lastSeen).toISOString(),
          });
        }
        await supabase.from('focus_active_sessions').delete().eq('user_id', userId);
        return;
      }

      // A shorter break in the heartbeat means the timer was not being watched
      // for a while (tab closed, device asleep). Crediting that gap as focus
      // time would overstate the day, so the session comes back paused at its
      // last heartbeat and the user decides whether to carry on.
      const gap = data.running && Date.now() - lastSeen > HEARTBEAT_MS * 3;
      if (gap) {
        const resumedAt = Date.parse(data.phase_start_at);
        const liveAtLastSeen = Number.isFinite(resumedAt)
          ? Math.max(0, (lastSeen - resumedAt) / 1000)
          : 0;
        applyRemoteRow({
          ...data,
          running: false,
          phase_base_seconds: (data.phase_base_seconds || 0) + liveAtLastSeen,
          phase_start_at: null,
          updated_at: data.last_seen_at,
        });
        // Tell the other devices about the pause, keeping the stored target.
        persistActive(
          data.target_ref || data.target_title
            ? { ref: data.target_ref, title: data.target_title, source: data.target_source }
            : null,
        );
        return;
      }

      applyRemoteRow(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const pause = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.running) return;
    eng.phaseBaseSeconds = liveElapsed(eng);
    eng.running = false;
    eng.phaseStartTs = 0;
    eng.lastWorkTs = Date.now();
    forceRender();
    persistActive();
  }, [forceRender, liveElapsed, persistActive]);

  // Total work seconds accrued this session (for logging): completed work
  // phases + current work-phase partial (stopwatch counts everything as work).
  const computeWorkSeconds = useCallback(() => {
    const eng = engineRef.current;
    if (eng.mode === 'stopwatch') return Math.round(liveElapsed(eng));
    const partial = eng.phase === 'work' ? liveElapsed(eng) : 0;
    return Math.round(eng.workLoggedSeconds + partial);
  }, [liveElapsed]);

  // Stop the session: log accrued work time, then reset the engine. The log is
  // skipped when another device got there first, so the entry is never doubled.
  const stopAndLog = useCallback(async () => {
    const eng = engineRef.current;
    const workSeconds = computeWorkSeconds();
    const startedAt = eng.sessionStartedAt;
    const sessionId = eng.sessionId;
    const mode = eng.mode;
    // A paused session ended when it was paused, not when the user got round to
    // pressing stop — otherwise the entry would claim every hour in between.
    const endedMs = eng.running || !eng.lastWorkTs ? Date.now() : eng.lastWorkTs;
    engineRef.current = {
      ...initialEngine,
      mode,
      pomoWork: eng.pomoWork,
      pomoBreak: eng.pomoBreak,
    };
    forceRender();
    if (!startedAt) return 0;
    const claimed = await claimStop(sessionId, startedAt);
    if (!claimed) return 0;
    if (workSeconds >= 1) {
      const startedMs = Date.parse(startedAt);
      await logSession({
        taskRef: target?.ref ?? null,
        taskTitle: target?.title ?? 'Фокус без задачи',
        source: target?.source ?? 'custom',
        mode,
        durationSeconds: workSeconds,
        startedAt,
        endedAt: new Date(Math.max(endedMs, startedMs || endedMs)).toISOString(),
      });
    }
    return workSeconds;
  }, [computeWorkSeconds, forceRender, logSession, target, claimStop]);

  const start = useCallback(() => {
    const eng = engineRef.current;
    if (eng.running) return;
    // Picking the timer up again long after it was paused is new work: close the
    // old session (it ended at the pause) and count from here.
    if (eng.sessionStartedAt && eng.lastWorkTs && Date.now() - eng.lastWorkTs > RESUME_GAP_MS) {
      stopAndLog();
    }
    const next = engineRef.current;
    next.running = true;
    next.phaseStartTs = Date.now();
    next.lastWorkTs = Date.now();
    if (!next.sessionStartedAt) {
      next.sessionStartedAt = new Date().toISOString();
      next.sessionId = newSessionId();
    }
    forceRender();
    persistActive();
  }, [forceRender, persistActive, stopAndLog]);

  const stopAndClose = useCallback(async () => {
    await stopAndLog();
    setOpen(false);
    setTarget(null);
  }, [stopAndLog]);

  const openFocus = useCallback((nextTarget = null, mode = 'stopwatch') => {
    const eng = engineRef.current;
    // If a session is already running for the same target, just reveal it.
    // A task-less session (both targets null) counts as the same target.
    const sameTarget =
      !!eng.sessionStartedAt &&
      (target?.ref ?? null) === (nextTarget?.ref ?? null) &&
      (target?.source ?? null) === (nextTarget?.source ?? null);
    if (!sameTarget) {
      // Switching targets ends the previous session instead of dropping it.
      if (eng.sessionStartedAt) stopAndLog();
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
  }, [forceRender, target, stopAndLog]);

  // Start counting right away, without showing the overlay (header shortcut).
  const startQuick = useCallback((nextTarget = null, mode = 'stopwatch') => {
    const eng = engineRef.current;
    if (eng.sessionStartedAt) return; // a session is already in progress
    engineRef.current = {
      ...initialEngine,
      mode: mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
      pomoWork: eng.pomoWork,
      pomoBreak: eng.pomoBreak,
      running: true,
      phaseStartTs: Date.now(),
      lastWorkTs: Date.now(),
      sessionStartedAt: new Date().toISOString(),
      sessionId: newSessionId(),
    };
    setTarget(nextTarget);
    forceRender();
    persistActive(nextTarget);
  }, [forceRender, persistActive]);

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
    persistActive();
  }, [forceRender, liveElapsed, persistActive]);

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
    sessionStartedAt: eng.sessionStartedAt,
    phaseElapsed,
    phaseTarget,
    phaseRemaining: phaseTarget === Infinity ? null : Math.max(0, phaseTarget - phaseElapsed),
    workSeconds: computeWorkSeconds(),
    cycles: eng.cycles,
    pomoWork: eng.pomoWork,
    pomoBreak: eng.pomoBreak,
    openFocus,
    startQuick,
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
    logSession,
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
