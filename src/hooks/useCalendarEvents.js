import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useCalendarEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .order('start_minute', { ascending: true, nullsFirst: true })
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setEvents(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    fetchEvents();
    const channel = supabase
      .channel('calendar_events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `user_id=eq.${user.id}` },
        fetchEvents,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, fetchEvents]);

  const addEvent = useCallback(
    async (payload) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ user_id: user.id, ...payload })
        .select()
        .single();
      if (!error && data) {
        setEvents((prev) => [...prev, data]);
        return data;
      }
      if (!error) await fetchEvents();
      return null;
    },
    [user?.id, fetchEvents],
  );

  const updateEvent = useCallback(async (id, payload) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...payload } : e)));
    const { error } = await supabase.from('calendar_events').update(payload).eq('id', id);
    if (error) await fetchEvents();
  }, [fetchEvents]);

  const deleteEvent = useCallback(async (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) await fetchEvents();
  }, [fetchEvents]);

  return { events, loading, addEvent, updateEvent, deleteEvent, refetch: fetchEvents };
}
