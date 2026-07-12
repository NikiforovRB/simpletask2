import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';

/** All task ids removed when deleting id (includes nested subtasks; matches ON DELETE CASCADE). */
function idsRemovedWithCascade(id, list) {
  const remove = new Set([id]);
  for (;;) {
    const before = remove.size;
    for (const t of list) {
      if (t.parent_id && remove.has(t.parent_id)) remove.add(t.id);
    }
    if (remove.size === before) break;
  }
  return remove;
}

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessibleProjectIds, setAccessibleProjectIds] = useState([]);

  const fetchTasks = useCallback(async () => {
    if (!user) return;

    // Projects the user can access: ones they own + ones shared with them.
    const [{ data: owned }, { data: memberships }] = await Promise.all([
      supabase.from('task_projects').select('id').eq('user_id', user.id),
      supabase.from('project_members').select('project_id').eq('user_id', user.id),
    ]);
    const projectIds = Array.from(
      new Set([
        ...(owned || []).map((p) => p.id),
        ...(memberships || []).map((m) => m.project_id),
      ]),
    );
    setAccessibleProjectIds(projectIds);

    // Personal tasks (inbox/someday + own project tasks).
    const ownPromise = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    // All tasks belonging to accessible projects (includes collaborators' tasks).
    const projectPromise = projectIds.length
      ? supabase
          .from('tasks')
          .select('*')
          .in('project_id', projectIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [{ data: own, error: ownErr }, { data: projectTasks }] = await Promise.all([
      ownPromise,
      projectPromise,
    ]);
    if (ownErr) {
      console.error('Tasks fetch error:', ownErr);
      setLoading(false);
      return;
    }
    const byId = new Map();
    for (const t of own || []) byId.set(t.id, t);
    for (const t of projectTasks || []) byId.set(t.id, t);
    const merged = Array.from(byId.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    setTasks(merged);
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

  // Reliable realtime for tasks in shared/owned projects (changes by any
  // collaborator), via per-project broadcast from the database.
  useEffect(() => {
    if (!user || accessibleProjectIds.length === 0) return;
    return subscribeProjects(accessibleProjectIds, fetchTasks);
  }, [user?.id, accessibleProjectIds, fetchTasks]);

  const addTask = async (payload) => {
    if (!user) return;
    const { data, error } = await supabase.from('tasks').insert({ user_id: user.id, ...payload }).select().single();
    if (!error && data) {
      setTasks((prev) => [...prev, data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      return data;
    } else if (!error) await fetchTasks();
    return null;
  };

  const updateTask = async (id, payload) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    const { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) await fetchTasks();
  };

  const deleteTask = async (id) => {
    setTasks((prev) => {
      const remove = idsRemovedWithCascade(id, prev);
      return prev.filter((t) => !remove.has(t.id));
    });
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) await fetchTasks();
  };

  const toggleComplete = async (task) => {
    await updateTask(task.id, {
      completed_at: task.completed_at ? null : new Date().toISOString(),
    });
  };

  const moveTask = async (taskId, { scheduled_date, parent_id, position, completed_at, list_type, project_id }) => {
    const payload = {};
    if (scheduled_date !== undefined) payload.scheduled_date = scheduled_date;
    if (parent_id !== undefined) payload.parent_id = parent_id;
    if (position !== undefined) payload.position = position;
    if (completed_at !== undefined) payload.completed_at = completed_at;
    if (list_type !== undefined) payload.list_type = list_type;
    if (project_id !== undefined) payload.project_id = project_id;
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
