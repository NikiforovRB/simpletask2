import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function genGirlId() {
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

function normalizeRow(row) {
  return { ...row, dates: Array.isArray(row.dates) ? row.dates : [] };
}

/** The «Девушки» list of the signed-in user (only for the chosen ones). */
export function useGirls() {
  const { user, isChosen } = useAuth();
  const userId = isChosen ? user?.id ?? null : null;
  const [rows, setRows] = useState({});
  const [loadedFor, setLoadedFor] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    supabase
      .from('girls')
      .select('*')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error('girls load error', err);
          setError('Не удалось загрузить список.');
          return;
        }
        const next = {};
        for (const row of data || []) next[row.id] = normalizeRow(row);
        setRows(next);
        setLoadedFor(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const put = (payload) => {
      const row = payload.new;
      if (row?.id) setRows((prev) => ({ ...prev, [row.id]: normalizeRow(row) }));
    };
    const channel = supabase
      .channel(`girls_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'girls', filter: `user_id=eq.${userId}` }, put)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'girls', filter: `user_id=eq.${userId}` }, put)
      // Deletes can't be filtered by user; an id that isn't ours is simply not in the map.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'girls' }, (payload) => {
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

  const girls = useMemo(
    () => (userId ? Object.values(rows).filter((r) => r.user_id === userId) : []),
    [rows, userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase.from('girls').select('*').eq('user_id', userId);
    if (err) return;
    const next = {};
    for (const row of data || []) next[row.id] = normalizeRow(row);
    setRows(next);
  }, [userId]);

  const addGirl = useCallback(async (fields) => {
    if (!userId) return null;
    const now = new Date().toISOString();
    const row = { ...fields, id: genGirlId(), user_id: userId, archived: false, created_at: now, updated_at: now };
    setError(null);
    setRows((prev) => ({ ...prev, [row.id]: row }));
    const { data, error: err } = await supabase.from('girls').insert(row).select().single();
    if (err) {
      console.error('girls insert error', err);
      setError(SAVE_ERROR);
      setRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return null;
    }
    if (data) setRows((prev) => ({ ...prev, [data.id]: normalizeRow(data) }));
    return row.id;
  }, [userId]);

  const updateGirl = useCallback(async (id, patch) => {
    if (!userId) return;
    const updates = { ...patch, updated_at: new Date().toISOString() };
    setError(null);
    setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
    const { error: err } = await supabase.from('girls').update(updates).eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('girls update error', err);
      setError(SAVE_ERROR);
      reload();
    }
  }, [userId, reload]);

  const deleteGirl = useCallback(async (id) => {
    if (!userId) return;
    setError(null);
    setRows((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const { error: err } = await supabase.from('girls').delete().eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('girls delete error', err);
      setError(SAVE_ERROR);
      reload();
    }
  }, [userId, reload]);

  return {
    girls,
    loaded: !!userId && loadedFor === userId,
    error,
    dismissError: () => setError(null),
    addGirl,
    updateGirl,
    deleteGirl,
  };
}
