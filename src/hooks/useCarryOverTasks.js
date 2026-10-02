import { useEffect, useRef, useState } from 'react';
import { toLocalDateString } from '../constants';
import { DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from './useCalendarDayHours';

const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};

/** Today's date, kept current past midnight and whenever the app is back on screen. */
function useToday() {
  const [today, setToday] = useState(() => toLocalDateString(new Date()));
  useEffect(() => {
    const check = () => setToday(toLocalDateString(new Date()));
    const id = setInterval(check, 60 * 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

/**
 * With the setting on, every open task of the user's left on a past day moves
 * to today, after today's own tasks and in the order it had. A timed one keeps
 * its time, and today's timeline widens to show it.
 *
 * A task is moved once a day: a write that fails, or a task put back on a past
 * day by hand, is left alone until tomorrow instead of bouncing.
 */
export function useCarryOverTasks({ enabled, ready, userId, tasks, updateTask, dayHours, setDayHours }) {
  const today = useToday();
  const movedRef = useRef(new Set());
  const writersRef = useRef({ updateTask, setDayHours, dayHours });
  useEffect(() => {
    writersRef.current = { updateTask, setDayHours, dayHours };
  });

  useEffect(() => {
    if (!enabled || !ready || !userId) return;
    const isOpenDayTask = (t) => t.user_id === userId
      && !t.parent_id
      && !t.completed_at
      && (t.list_type || 'inbox') === 'inbox';
    const stale = tasks
      .filter((t) => isOpenDayTask(t)
        && t.scheduled_date
        && t.scheduled_date < today
        && !movedRef.current.has(`${today}|${t.id}`))
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.position ?? 0) - (b.position ?? 0));
    if (!stale.length) return;

    const { updateTask: update, setDayHours: setHours, dayHours: hours } = writersRef.current;
    const todays = tasks.filter((t) => isOpenDayTask(t) && t.scheduled_date === today);
    const base = todays.length ? Math.max(...todays.map((t) => t.position ?? 0)) + 1 : 0;
    let fromHour = Infinity;
    let toHour = -Infinity;
    stale.forEach((t, i) => {
      movedRef.current.add(`${today}|${t.id}`);
      update(t.id, { scheduled_date: today, position: base + i });
      const start = timeToMin(t.scheduled_time);
      if (start == null) return;
      const end = timeToMin(t.scheduled_end_time);
      fromHour = Math.min(fromHour, Math.floor(start / 60));
      toHour = Math.max(toHour, Math.ceil((end != null && end > start ? end : start + 60) / 60));
    });

    const scale = hours[today] || { start: DEFAULT_DAY_START_HOUR, end: DEFAULT_DAY_END_HOUR };
    if (fromHour < scale.start || toHour > scale.end) {
      setHours(today, Math.min(scale.start, fromHour), Math.max(scale.end, toHour));
    }
  }, [enabled, ready, userId, tasks, today]);
}
