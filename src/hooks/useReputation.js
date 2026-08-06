import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * The promises are read in two places at once — the reputation section and the
 * day lists of Plans / Calendar — so every instance of the hook shares one set
 * of rows. A promise added or edited anywhere shows up in both sections right
 * away, instead of only after a reload (which is all a per-instance state could
 * offer, since the two copies never heard about each other's writes).
 */
let store = { userId: null, promises: [], loading: true };
const listeners = new Set();
let channel = null;
let instances = 0;

function publish(patch) {
  store = { ...store, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(onChange) {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

const getStore = () => store;

async function loadPromises(userId) {
  if (!userId) {
    publish({ promises: [], loading: false });
    return;
  }
  const { data, error } = await supabase
    .from('reputation_promises')
    .select('*')
    .eq('user_id', userId)
    .order('promise_date', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (store.userId !== userId) return; // the user changed while we were loading
  publish(error ? { loading: false } : { promises: data || [], loading: false });
}

export function useReputation() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const state = useSyncExternalStore(subscribe, getStore);

  // One fetch and one realtime channel serve every instance.
  useEffect(() => {
    instances += 1;
    if (store.userId !== userId) {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      publish({ userId, promises: [], loading: !!userId });
      loadPromises(userId);
    }
    if (userId && !channel) {
      channel = supabase
        .channel(`reputation_promises_${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reputation_promises', filter: `user_id=eq.${userId}` },
          () => loadPromises(userId),
        )
        .subscribe();
    }
    return () => {
      instances -= 1;
      if (instances === 0 && channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [userId]);

  const addPromise = useCallback(
    async (payload) => {
      if (!userId) return null;
      const sameDay = store.promises.filter((p) => p.promise_date === payload.promise_date);
      const position = sameDay.length ? Math.max(...sameDay.map((p) => p.position ?? 0)) + 1 : 0;
      const { data, error } = await supabase
        .from('reputation_promises')
        .insert({ user_id: userId, position, ...payload })
        .select()
        .single();
      if (!error && data) {
        publish({ promises: [...store.promises, data] });
        return data;
      }
      await loadPromises(userId);
      return null;
    },
    [userId],
  );

  const updatePromise = useCallback(async (id, patch) => {
    publish({ promises: store.promises.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    const { error } = await supabase.from('reputation_promises').update(patch).eq('id', id);
    if (error) await loadPromises(store.userId);
  }, []);

  const deletePromise = useCallback(async (id) => {
    publish({ promises: store.promises.filter((p) => p.id !== id) });
    const { error } = await supabase.from('reputation_promises').delete().eq('id', id);
    if (error) await loadPromises(store.userId);
  }, []);

  const refetch = useCallback(() => loadPromises(store.userId), []);

  return {
    promises: state.promises,
    loading: state.loading,
    addPromise,
    updatePromise,
    deletePromise,
    refetch,
  };
}

/**
 * Tri-state of a single promise: 'done' | 'failed' | 'neutral'.
 * yesno uses fact_value: null = neutral, >=1 = done, 0 = failed.
 * time/count: not recorded (fact null) = neutral; fact >= plan = done; else failed.
 */
export function promiseState(p) {
  if (p.kind === 'yesno') {
    if (p.fact_value == null) return 'neutral';
    return p.fact_value >= 1 ? 'done' : 'failed';
  }
  if (p.plan_value == null || p.fact_value == null) return 'neutral';
  return p.fact_value >= p.plan_value ? 'done' : 'failed';
}

export function isPromiseFulfilled(p) {
  return promiseState(p) === 'done';
}

/**
 * Day status: 'empty' (no promises) | 'neutral' (nothing decided) |
 * 'green' (all done) | 'green50' (some done, no fails, some pending) |
 * 'yellow' (some done + some failed) | 'red' (no done, some failed).
 */
export function dayStatus(dayPromises) {
  if (!dayPromises || dayPromises.length === 0) return 'empty';
  let done = 0;
  let failed = 0;
  for (const p of dayPromises) {
    const s = promiseState(p);
    if (s === 'done') done++;
    else if (s === 'failed') failed++;
  }
  const total = dayPromises.length;
  if (done === total) return 'green';
  if (done >= 1 && failed >= 1) return 'yellow';
  if (done >= 1) return 'green50';
  if (failed >= 1) return 'red';
  return 'neutral';
}
