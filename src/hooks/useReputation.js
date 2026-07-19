import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useReputation() {
  const { user } = useAuth();
  const [promises, setPromises] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPromises = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reputation_promises')
      .select('*')
      .eq('user_id', user.id)
      .order('promise_date', { ascending: true })
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setPromises(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setPromises([]);
      setLoading(false);
      return;
    }
    fetchPromises();
    const channel = supabase
      .channel('reputation_promises')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reputation_promises', filter: `user_id=eq.${user.id}` },
        fetchPromises,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, fetchPromises]);

  const addPromise = useCallback(
    async (payload) => {
      if (!user) return null;
      const sameDay = promises.filter((p) => p.promise_date === payload.promise_date);
      const position = sameDay.length ? Math.max(...sameDay.map((p) => p.position ?? 0)) + 1 : 0;
      const { data, error } = await supabase
        .from('reputation_promises')
        .insert({ user_id: user.id, position, ...payload })
        .select()
        .single();
      if (!error && data) {
        setPromises((prev) => [...prev, data]);
        return data;
      }
      if (!error) await fetchPromises();
      return null;
    },
    [user?.id, promises, fetchPromises],
  );

  const updatePromise = useCallback(async (id, patch) => {
    setPromises((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from('reputation_promises').update(patch).eq('id', id);
    if (error) await fetchPromises();
  }, [fetchPromises]);

  const deletePromise = useCallback(async (id) => {
    setPromises((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from('reputation_promises').delete().eq('id', id);
    if (error) await fetchPromises();
  }, [fetchPromises]);

  return { promises, loading, addPromise, updatePromise, deletePromise, refetch: fetchPromises };
}

/** Whether a single promise counts as fulfilled. */
export function isPromiseFulfilled(p) {
  if (p.kind === 'yesno') return !!p.done;
  if (p.plan_value == null || p.fact_value == null) return false;
  return p.fact_value >= p.plan_value;
}

/** Day status from its promises: 'green' | 'yellow' | 'red' | 'empty'. */
export function dayStatus(dayPromises) {
  if (!dayPromises || dayPromises.length === 0) return 'empty';
  const fulfilled = dayPromises.filter(isPromiseFulfilled).length;
  if (fulfilled === dayPromises.length) return 'green';
  if (fulfilled === 0) return 'red';
  return 'yellow';
}
