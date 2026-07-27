import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const DEFAULT_DAY_START_HOUR = 7;
export const DEFAULT_DAY_END_HOUR = 20;

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
};

/**
 * Per-day timeline window for the calendar. Rows exist only for days that
 * differ from the 07:00–20:00 default, so the table stays tiny.
 */
export function useCalendarDayHours() {
  const { user } = useAuth();
  const [byDate, setByDate] = useState({});

  const fetchHours = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('calendar_day_hours')
      .select('day_date, start_hour, end_hour')
      .eq('user_id', user.id);
    if (error) return;
    const map = {};
    for (const row of data || []) {
      map[row.day_date] = { start: row.start_hour, end: row.end_hour };
    }
    setByDate(map);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setByDate({});
      return;
    }
    fetchHours();
  }, [user?.id, fetchHours]);

  const getDayHours = useCallback(
    (dateStr) => byDate[dateStr] || { start: DEFAULT_DAY_START_HOUR, end: DEFAULT_DAY_END_HOUR },
    [byDate],
  );

  const setDayHours = useCallback(
    async (dateStr, startHour, endHour) => {
      if (!user) return;
      const start = clamp(startHour, 0, 23, DEFAULT_DAY_START_HOUR);
      let end = clamp(endHour, 1, 24, DEFAULT_DAY_END_HOUR);
      if (end <= start) end = Math.min(24, start + 1);
      setByDate((prev) => ({ ...prev, [dateStr]: { start, end } }));
      const { error } = await supabase
        .from('calendar_day_hours')
        .upsert(
          { user_id: user.id, day_date: dateStr, start_hour: start, end_hour: end, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,day_date' },
        );
      if (error) await fetchHours();
    },
    [user?.id, fetchHours],
  );

  const resetDayHours = useCallback(
    async (dateStr) => {
      if (!user) return;
      setByDate((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      const { error } = await supabase
        .from('calendar_day_hours')
        .delete()
        .eq('user_id', user.id)
        .eq('day_date', dateStr);
      if (error) await fetchHours();
    },
    [user?.id, fetchHours],
  );

  return { dayHours: byDate, getDayHours, setDayHours, resetDayHours };
}
