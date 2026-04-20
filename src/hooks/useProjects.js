import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('task_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setProjects(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    fetchProjects();
    const channel = supabase
      .channel('task_projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_projects', filter: `user_id=eq.${user.id}` }, fetchProjects)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, fetchProjects]);

  const addProject = async (title, kind = 'project') => {
    if (!user) return null;
    const maxPos = projects.length ? Math.max(...projects.map((p) => p.position ?? 0)) : -1;
    const { data, error } = await supabase
      .from('task_projects')
      .insert({ user_id: user.id, title: title.trim(), position: maxPos + 1, kind })
      .select()
      .single();
    if (!error && data) {
      setProjects((prev) => [...prev, data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      return data;
    }
    if (!error) fetchProjects();
    return null;
  };

  const reorderProjects = async (orderedIds) => {
    if (!user) return;
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from('task_projects').update({ position: i }).eq('id', orderedIds[i]).eq('user_id', user.id);
    }
    setProjects((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    });
  };

  const updateProject = async (projectId, { title }) => {
    if (!user) return;
    const { error } = await supabase
      .from('task_projects')
      .update({ title: title?.trim() ?? '' })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (!error) {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, title: title?.trim() ?? p.title } : p)));
    } else {
      fetchProjects();
    }
  };

  const deleteProject = async (projectId) => {
    if (!user) return;
    const { error } = await supabase
      .from('task_projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (!error) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } else {
      fetchProjects();
    }
  };

  return { projects, loading, addProject, updateProject, deleteProject, reorderProjects };
}

