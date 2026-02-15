import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (!error) setTasks(data || []);
    else console.error('Tasks fetch error:', error);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    fetchTasks();
    const channel = supabase
      .channel('tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, fetchTasks)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, fetchTasks]);

  const addTask = async (payload) => {
    if (!user) return;
    const { data, error } = await supabase.from('tasks').insert({ user_id: user.id, ...payload }).select().single();
    if (!error && data) {
      setTasks((prev) => [...prev, data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } else if (!error) await fetchTasks();
  };

  const updateTask = async (id, payload) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    const { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) await fetchTasks();
  };

  const deleteTask = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) await fetchTasks();
  };

  const toggleComplete = async (task) => {
    await updateTask(task.id, {
      completed_at: task.completed_at ? null : new Date().toISOString(),
    });
  };

  const moveTask = async (taskId, { scheduled_date, parent_id, position, completed_at }) => {
    const payload = {};
    if (scheduled_date !== undefined) payload.scheduled_date = scheduled_date;
    if (parent_id !== undefined) payload.parent_id = parent_id;
    if (position !== undefined) payload.position = position;
    if (completed_at !== undefined) payload.completed_at = completed_at;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...payload } : t)));
    const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
    if (error) await fetchTasks();
  };

  const reorderTasksInList = async (listTasks, orderedIds) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const task = listTasks.find((t) => t.id === id);
      if (task && (task.position ?? 0) !== i) {
        await supabase.from('tasks').update({ position: i }).eq('id', id);
      }
    }
    await fetchTasks();
  };

  return { tasks, loading, addTask, updateTask, deleteTask, toggleComplete, moveTask, reorderTasksInList };
}
