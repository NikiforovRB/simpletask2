import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SAVE_ERROR = 'Не удалось сохранить. Проверьте подключение и попробуйте ещё раз.';

async function fetchMeals(userId, from, to) {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .gte('meal_date', from)
    .lte('meal_date', to);
  if (error) {
    console.error('meals load error', error);
    return null;
  }
  return data || [];
}

/** The cached rows with the range from..to replaced by what was just read. */
function mergeRange(prev, data, userId, from, to) {
  const next = {};
  for (const [id, row] of Object.entries(prev)) {
    if (row.user_id === userId && (row.meal_date < from || row.meal_date > to)) next[id] = row;
  }
  for (const row of data) next[row.id] = row;
  return next;
}

/**
 * The meals of the days from `from` to `to` ("YYYY-MM-DD", both included).
 * Only that range is read (a year of meals would not fit in one response),
 * but the rows of ranges seen before stay cached, so paging between days
 * doesn't blink.
 */
export function useMeals(from, to) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [rows, setRows] = useState({});
  const [loadedKey, setLoadedKey] = useState(null);
  const [error, setError] = useState(null);
  const rangeKey = `${userId}|${from}|${to}`;

  useEffect(() => {
    if (!userId || !from || !to) return undefined;
    let cancelled = false;
    fetchMeals(userId, from, to).then((data) => {
      if (cancelled || !data) return;
      setRows((prev) => mergeRange(prev, data, userId, from, to));
      setLoadedKey(`${userId}|${from}|${to}`);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, from, to]);

  const reload = useCallback(async () => {
    if (!userId || !from || !to) return;
    const data = await fetchMeals(userId, from, to);
    if (data) setRows((prev) => mergeRange(prev, data, userId, from, to));
  }, [userId, from, to]);

  useEffect(() => {
    if (!userId) return undefined;
    const put = (payload) => {
      const row = payload.new;
      if (row?.id) setRows((prev) => ({ ...prev, [row.id]: row }));
    };
    const channel = supabase
      .channel(`meals_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meals', filter: `user_id=eq.${userId}` }, put)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meals', filter: `user_id=eq.${userId}` }, put)
      // Deletes can't be filtered by user; an id that isn't ours is simply not in the map.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meals' }, (payload) => {
        const id = payload.old?.id;
        if (!id) return;
        setRows((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const meals = useMemo(
    () => (userId
      ? Object.values(rows).filter((r) => r.user_id === userId && r.meal_date >= from && r.meal_date <= to)
      : []),
    [rows, userId, from, to],
  );

  const addMeal = useCallback(async ({ meal_date, meal_time, comment, calories }) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const row = {
      id: genId(),
      user_id: userId,
      meal_date,
      meal_time,
      comment,
      calories: calories ?? null,
      created_at: now,
      updated_at: now,
    };
    setError(null);
    setRows((prev) => ({ ...prev, [row.id]: row }));
    const { data, error: err } = await supabase.from('meals').insert(row).select().single();
    if (err) {
      console.error('meals insert error', err);
      setError(SAVE_ERROR);
      setRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    if (data) setRows((prev) => ({ ...prev, [data.id]: data }));
  }, [userId]);

  const updateMeal = useCallback(async (id, patch) => {
    if (!userId) return;
    const updates = { ...patch, updated_at: new Date().toISOString() };
    setError(null);
    setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
    const { error: err } = await supabase.from('meals').update(updates).eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('meals update error', err);
      setError(SAVE_ERROR);
      reload();
    }
  }, [userId, reload]);

  const deleteMeal = useCallback(async (id) => {
    if (!userId) return;
    setError(null);
    setRows((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const { error: err } = await supabase.from('meals').delete().eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('meals delete error', err);
      setError(SAVE_ERROR);
      reload();
    }
  }, [userId, reload]);

  return {
    meals,
    loaded: loadedKey === rangeKey,
    error,
    dismissError: () => setError(null),
    addMeal,
    updateMeal,
    deleteMeal,
  };
}
