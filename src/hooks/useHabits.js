import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const LS_KEY = (userId) => `dashboard_habits_v1_${userId}`;
const MIGRATED_FLAG = (userId) => `habits_migrated_to_supabase_${userId}`;

function entriesFromRows(rows) {
  const map = {};
  for (const row of rows || []) {
    if (!map[row.habit_id]) map[row.habit_id] = {};
    const d = typeof row.entry_date === 'string' ? row.entry_date.slice(0, 10) : row.entry_date;
    map[row.habit_id][d] = row.payload && typeof row.payload === 'object' ? row.payload : {};
  }
  return map;
}

async function migrateLocalStorageToSupabase(userId) {
  try {
    if (localStorage.getItem(MIGRATED_FLAG(userId))) return;
    const raw = localStorage.getItem(LS_KEY(userId));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.habits?.length) return;
    const { data: existing, error: countErr } = await supabase.from('habits').select('id').eq('user_id', userId).limit(1);
    if (countErr) return;
    if (existing?.length) {
      localStorage.setItem(MIGRATED_FLAG(userId), '1');
      return;
    }
    for (const h of [...parsed.habits].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const { data: newH, error } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          title: h.title,
          type: h.type || 'yes_no',
          limit_number: h.limit_number ?? null,
          limit_time: h.limit_time ?? null,
          skip_mode: h.skip_mode || 'none',
          streak_enabled: h.streak_enabled !== false,
          anchor_date: h.anchor_date || h.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          position: h.position ?? 0,
        })
        .select('id')
        .single();
      if (error || !newH?.id) continue;
      const hid = newH.id;
      const oldId = h.id;
      const byDate = parsed.entries?.[oldId] || {};
      for (const [ds, payload] of Object.entries(byDate)) {
        await supabase.from('habit_entries').upsert(
          {
            habit_id: hid,
            entry_date: ds,
            payload: payload && typeof payload === 'object' ? payload : {},
          },
          { onConflict: 'habit_id,entry_date' }
        );
      }
    }
    localStorage.setItem(MIGRATED_FLAG(userId), '1');
  } catch {
    /* ignore */
  }
}

export function useHabits() {
  const { user } = useAuth();
  const [state, setState] = useState({ habits: [], entries: {} });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setState({ habits: [], entries: {} });
      setLoading(false);
      return;
    }
    const { data: hData, error: hErr } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (hErr) {
      setLoading(false);
      return;
    }
    const habitsList = hData || [];
    const ids = habitsList.map((h) => h.id);
    let entryMap = {};
    if (ids.length) {
      const { data: eData } = await supabase.from('habit_entries').select('*').in('habit_id', ids);
      entryMap = entriesFromRows(eData);
    }
    setState({ habits: habitsList, entries: entryMap });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setState({ habits: [], entries: {} });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      await migrateLocalStorageToSupabase(user.id);
      if (cancelled) return;
      await fetchAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchAll]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('habits_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${user.id}` }, () => {
        fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_entries' }, () => {
        fetchAll();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, fetchAll]);

  const habits = useMemo(
    () => [...state.habits].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [state.habits]
  );

  const addHabit = useCallback(
    async (payload) => {
      if (!user?.id) return null;
      const maxPos = state.habits.length ? Math.max(...state.habits.map((h) => h.position ?? 0)) : -1;
      const anchor = payload.anchor_date || new Date().toISOString().slice(0, 10);
      const row = {
        user_id: user.id,
        title: (payload.title || '').trim() || 'Привычка',
        type: payload.type || 'yes_no',
        limit_number: payload.limit_number ?? null,
        limit_time: payload.limit_time ?? null,
        skip_mode: payload.skip_mode || 'none',
        streak_enabled: payload.streak_enabled !== undefined ? !!payload.streak_enabled : true,
        anchor_date: anchor,
        position: maxPos + 1,
      };
      const { data, error } = await supabase.from('habits').insert(row).select().single();
      await fetchAll();
      if (!error && data) return data.id;
      return null;
    },
    [user?.id, state.habits, fetchAll]
  );

  const updateHabit = useCallback(
    async (habitId, patch) => {
      if (!user?.id) return;
      const updates = { ...patch };
      if (patch.title != null) updates.title = String(patch.title).trim();
      Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);
      await supabase.from('habits').update(updates).eq('id', habitId).eq('user_id', user.id);
      await fetchAll();
    },
    [user?.id, fetchAll]
  );

  const deleteHabit = useCallback(
    async (habitId) => {
      if (!user?.id) return;
      await supabase.from('habits').delete().eq('id', habitId).eq('user_id', user.id);
      await fetchAll();
    },
    [user?.id, fetchAll]
  );

  const reorderHabits = useCallback(
    async (orderedIds) => {
      if (!user?.id) return;
      for (let i = 0; i < orderedIds.length; i++) {
        await supabase.from('habits').update({ position: i }).eq('id', orderedIds[i]).eq('user_id', user.id);
      }
      await fetchAll();
    },
    [user?.id, fetchAll]
  );

  const setEntry = useCallback(
    async (habitId, dateStr, entryPatch) => {
      if (!user?.id) return;

      let optimisticMerged = null;
      setState((s) => {
        const prevAll = s.entries || {};
        const habitMap = { ...(prevAll[habitId] || {}) };
        if (entryPatch == null) {
          delete habitMap[dateStr];
        } else {
          const prev = habitMap[dateStr] && typeof habitMap[dateStr] === 'object' ? habitMap[dateStr] : {};
          const merged = { ...prev, ...entryPatch };
          habitMap[dateStr] = merged;
          optimisticMerged = merged;
        }
        return { ...s, entries: { ...prevAll, [habitId]: habitMap } };
      });

      try {
        if (entryPatch == null) {
          const { error } = await supabase
            .from('habit_entries')
            .delete()
            .eq('habit_id', habitId)
            .eq('entry_date', dateStr);
          if (error) console.error('habit_entries delete error', error);
        } else {
          const payload = optimisticMerged || { ...entryPatch };
          const { error } = await supabase.from('habit_entries').upsert(
            {
              habit_id: habitId,
              entry_date: dateStr,
              payload,
            },
            { onConflict: 'habit_id,entry_date' }
          );
          if (error) console.error('habit_entries upsert error', error);
        }
      } catch (err) {
        console.error('habit_entries save error', err);
      }

      await fetchAll();
    },
    [user?.id, fetchAll]
  );

  return {
    habits,
    entries: state.entries,
    loading,
    addHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
    setEntry,
  };
}
