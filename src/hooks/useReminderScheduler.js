import { useEffect, useRef } from 'react';
import { notificationPermission, showLocalNotification, formatTimeHHMM } from '../lib/reminders';

const FIRED_STORE_KEY = 'reminders_fired_v1';

function loadFired() {
  try {
    const raw = localStorage.getItem(FIRED_STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFired(set) {
  try {
    // Keep the store from growing unbounded — last 300 keys is plenty.
    const arr = Array.from(set).slice(-300);
    localStorage.setItem(FIRED_STORE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/** Parse a task's local date + time into a Date, or null if incomplete. */
function fireDateFor(task) {
  if (!task.scheduled_date || !task.scheduled_time || task.reminder_minutes == null) return null;
  const hhmm = formatTimeHHMM(task.scheduled_time);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date(`${task.scheduled_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(h, m, 0, 0);
  d.setMinutes(d.getMinutes() - Number(task.reminder_minutes || 0));
  return d;
}

/**
 * Watches the given tasks and fires a local notification when each task's
 * reminder time arrives (while the app is open). Fired reminders are recorded
 * in localStorage so they don't repeat across re-renders or reloads.
 *
 * `tasks` items need: id, title, scheduled_date, scheduled_time,
 * reminder_minutes, completed_at, text_color.
 */
export function useReminderScheduler(tasks) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const firedRef = useRef(null);
  if (firedRef.current === null) firedRef.current = loadFired();

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      if (notificationPermission() !== 'granted') return;
      const now = Date.now();
      const fired = firedRef.current;
      let changed = false;
      for (const task of tasksRef.current || []) {
        if (task.completed_at) continue;
        const fireDate = fireDateFor(task);
        if (!fireDate) continue;
        const key = `${task.id}|${task.scheduled_date}|${formatTimeHHMM(task.scheduled_time)}|${task.reminder_minutes}`;
        if (fired.has(key)) continue;
        const diff = now - fireDate.getTime();
        // Fire once when the reminder becomes due. We allow up to a 12h late
        // window so a reminder still surfaces if the app was reopened shortly
        // after the moment passed, but won't spam very stale items.
        if (diff >= 0 && diff <= 12 * 60 * 60 * 1000) {
          const at = formatTimeHHMM(task.scheduled_time);
          const mins = Number(task.reminder_minutes || 0);
          const body = mins === 0 ? `Сейчас: ${at}` : `Через ${mins} мин — в ${at}`;
          showLocalNotification(task.title || 'Задача', { body, tag: `task-${task.id}` });
          fired.add(key);
          changed = true;
        }
      }
      if (changed) saveFired(fired);
    };

    check();
    const id = setInterval(check, 20 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
