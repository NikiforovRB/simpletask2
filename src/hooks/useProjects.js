import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!user) return;

    const ownedPromise = supabase
      .from('task_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    const membershipPromise = supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    const [{ data: owned, error: ownedErr }, { data: memberships }] = await Promise.all([
      ownedPromise,
      membershipPromise,
    ]);

    const ownedList = ownedErr ? [] : (owned || []).map((p) => ({ ...p, is_shared: false }));

    const sharedIds = (memberships || []).map((m) => m.project_id);
    let sharedList = [];
    if (sharedIds.length) {
      const { data: shared } = await supabase
        .from('task_projects')
        .select('*')
        .in('id', sharedIds)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      sharedList = (shared || []).map((p) => ({ ...p, is_shared: true }));
    }

    setProjects([...ownedList, ...sharedList]);
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
    const memberChannel = supabase
      .channel(`project_members_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members', filter: `user_id=eq.${user.id}` }, fetchProjects)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(memberChannel);
    };
  }, [user?.id, fetchProjects]);

  // Live updates when a collaborator edits a shared project (e.g. rename),
  // via per-project broadcast from the database.
  const projectIdsKey = useMemo(() => projects.map((p) => p.id).sort().join(','), [projects]);
  useEffect(() => {
    if (!user) return;
    const ids = projectIdsKey ? projectIdsKey.split(',') : [];
    if (ids.length === 0) return;
    return subscribeProjects(ids, fetchProjects);
  }, [user?.id, projectIdsKey, fetchProjects]);

  const addProject = async (title, kind = 'project') => {
    if (!user) return null;
    const ownedPositions = projects.filter((p) => !p.is_shared).map((p) => p.position ?? 0);
    const maxPos = ownedPositions.length ? Math.max(...ownedPositions) : -1;
    const { data, error } = await supabase
      .from('task_projects')
      .insert({ user_id: user.id, title: title.trim(), position: maxPos + 1, kind })
      .select()
      .single();
    if (!error && data) {
      setProjects((prev) => [...prev, { ...data, is_shared: false }].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
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
    // No user_id filter: RLS allows the owner or a shared member to rename.
    const { error } = await supabase
      .from('task_projects')
      .update({ title: title?.trim() ?? '' })
      .eq('id', projectId);
    if (!error) {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, title: title?.trim() ?? p.title } : p)));
    } else {
      fetchProjects();
    }
  };

  const deleteProject = async (projectId) => {
    if (!user) return;
    // Only the owner can delete (enforced here and by RLS).
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

  return { projects, loading, addProject, updateProject, deleteProject, reorderProjects, refetch: fetchProjects };
}
