import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

function clampSidebarWidth(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(100, Math.min(400, Math.round(v)));
  return 220;
}

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    days_count: 3,
    new_tasks_position: 'start',
    no_date_list_visible: true,
    completed_visible: true,
    sidebar_width_px: 220,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetch = async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('days_count, new_tasks_position, no_date_list_visible, completed_visible, sidebar_width_px')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data) {
        setSettings({
          days_count: data.days_count,
          new_tasks_position: data.new_tasks_position || 'start',
          no_date_list_visible: data.no_date_list_visible !== false,
          completed_visible: data.completed_visible !== false,
          sidebar_width_px: clampSidebarWidth(data.sidebar_width_px),
        });
      } else if (!error && !data) {
        await supabase.from('user_settings').insert({
          user_id: user.id,
          days_count: 3,
          new_tasks_position: 'start',
          no_date_list_visible: true,
          completed_visible: true,
          sidebar_width_px: 220,
        });
        setSettings({ days_count: 3, new_tasks_position: 'start', no_date_list_visible: true, completed_visible: true, sidebar_width_px: 220 });
      }
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  const setDaysCount = async (days_count) => {
    if (!user) return;
    const n = Math.max(1, Math.min(7, Number(days_count)));
    await supabase.from('user_settings').upsert({ user_id: user.id, days_count: n }, { onConflict: 'user_id' });
    setSettings((s) => ({ ...s, days_count: n }));
  };

  const setNewTasksPosition = async (new_tasks_position) => {
    if (!user) return;
    const v = new_tasks_position === 'end' ? 'end' : 'start';
    await supabase.from('user_settings').update({ new_tasks_position: v }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, new_tasks_position: v }));
  };

  const setNoDateListVisible = async (no_date_list_visible) => {
    if (!user) return;
    await supabase.from('user_settings').update({ no_date_list_visible }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, no_date_list_visible }));
  };

  const setCompletedVisible = async (completed_visible) => {
    if (!user) return;
    await supabase.from('user_settings').update({ completed_visible }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, completed_visible }));
  };

  const setSidebarWidthPx = async (sidebar_width_px) => {
    if (!user) return;
    const w = clampSidebarWidth(sidebar_width_px);
    await supabase.from('user_settings').update({ sidebar_width_px: w }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, sidebar_width_px: w }));
  };

  return { settings, setDaysCount, setNewTasksPosition, setNoDateListVisible, setCompletedVisible, setSidebarWidthPx, loading };
}
