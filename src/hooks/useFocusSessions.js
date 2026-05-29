import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Reads the user's focus/Pomodoro sessions and exposes a logger. Sessions are
 * append-only records used by the analytics page; we keep a realtime channel
 * so logging from the focus timer reflects immediately on the analytics view.
 */
export function useFocusSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Unique channel name per hook instance — this hook is used in more than one
  // place (FocusProvider + FocusAnalytics), and reusing one topic name would
  // make the subscriptions clash.
  const channelIdRef = useRef(`focus_sessions_${Math.random().toString(16).slice(2)}`);

  const fetchSessions = useCallback(async () => {
    if (!user?.id) {
      setSessions([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false });
    if (!error) setSessions(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSessions();
    const ch = supabase
      .channel(channelIdRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions', filter: `user_id=eq.${user.id}` },
        () => fetchSessions()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, fetchSessions]);

  const logSession = useCallback(
    async ({ taskRef = null, taskTitle = '', source = 'custom', mode = 'stopwatch', durationSeconds, startedAt, endedAt }) => {
      if (!user?.id) return null;
      const secs = Math.max(0, Math.round(durationSeconds || 0));
      if (secs < 1) return null;
      const row = {
        user_id: user.id,
        task_ref: taskRef ? String(taskRef) : null,
        task_title: taskTitle || '',
        source,
        mode: mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
        duration_seconds: secs,
        started_at: startedAt || new Date().toISOString(),
        ended_at: endedAt || new Date().toISOString(),
      };
      // Optimistic insert so the analytics view updates instantly.
      const optimistic = { ...row, id: `tmp-${Math.random().toString(16).slice(2)}`, created_at: new Date().toISOString() };
      setSessions((prev) => [optimistic, ...prev]);
      const { data, error } = await supabase.from('focus_sessions').insert(row).select().single();
      if (error || !data) {
        setSessions((prev) => prev.filter((s) => s.id !== optimistic.id));
        return null;
      }
      setSessions((prev) => prev.map((s) => (s.id === optimistic.id ? data : s)));
      return data;
    },
    [user?.id]
  );

  const deleteSession = useCallback(
    async (id) => {
      if (!user?.id) return;
      setSessions((prev) => prev.filter((s) => s.id !== id));
      await supabase.from('focus_sessions').delete().eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  const updateSession = useCallback(
    async (id, patch) => {
      if (!user?.id) return;
      const clean = {};
      if (patch.duration_seconds != null) clean.duration_seconds = Math.max(0, Math.round(patch.duration_seconds));
      if (patch.task_title != null) clean.task_title = patch.task_title;
      if (!Object.keys(clean).length) return;
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...clean } : s)));
      await supabase.from('focus_sessions').update(clean).eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  return { sessions, loading, logSession, deleteSession, updateSession, refetch: fetchSessions };
}
