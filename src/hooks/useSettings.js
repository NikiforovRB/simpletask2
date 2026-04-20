import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { normalizeTaskFontScale, normalizeTaskFontWeight } from '../lib/taskFontSettings';

function clampSidebarWidth(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(100, Math.min(400, Math.round(v)));
  return 220;
}

function clampHabitsSidebarWidth(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(100, Math.min(400, Math.round(v)));
  return 220;
}

function clampBoardZoom(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(25, Math.min(200, Math.round(v)));
  return 100;
}

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    days_count: 3,
    new_tasks_position: 'start',
    no_date_list_visible: true,
    completed_visible: true,
    sidebar_width_px: 220,
    habits_sidebar_width_px: 220,
    task_font_weight: 'medium',
    task_font_scale: 1,
    board_zoom: 100,
    board_dots: false,
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
        .select(
          'days_count, new_tasks_position, no_date_list_visible, completed_visible, sidebar_width_px, habits_sidebar_width_px, task_font_weight, task_font_scale, board_zoom, board_dots'
        )
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data) {
        setSettings({
          days_count: data.days_count,
          new_tasks_position: data.new_tasks_position || 'start',
          no_date_list_visible: data.no_date_list_visible !== false,
          completed_visible: data.completed_visible !== false,
          sidebar_width_px: clampSidebarWidth(data.sidebar_width_px),
          habits_sidebar_width_px: clampHabitsSidebarWidth(data.habits_sidebar_width_px),
          task_font_weight: normalizeTaskFontWeight(data.task_font_weight),
          task_font_scale: normalizeTaskFontScale(data.task_font_scale),
          board_zoom: clampBoardZoom(data.board_zoom),
          board_dots: data.board_dots === true,
        });
      } else if (!error && !data) {
        await supabase.from('user_settings').insert({
          user_id: user.id,
          days_count: 3,
          new_tasks_position: 'start',
          no_date_list_visible: true,
          completed_visible: true,
          sidebar_width_px: 220,
          habits_sidebar_width_px: 220,
          task_font_weight: 'medium',
          task_font_scale: 1,
          board_zoom: 100,
          board_dots: false,
        });
        setSettings({
          days_count: 3,
          new_tasks_position: 'start',
          no_date_list_visible: true,
          completed_visible: true,
          sidebar_width_px: 220,
          habits_sidebar_width_px: 220,
          task_font_weight: 'medium',
          task_font_scale: 1,
          board_zoom: 100,
          board_dots: false,
        });
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

  const setHabitsSidebarWidthPx = async (habits_sidebar_width_px) => {
    if (!user) return;
    const w = clampHabitsSidebarWidth(habits_sidebar_width_px);
    await supabase.from('user_settings').update({ habits_sidebar_width_px: w }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, habits_sidebar_width_px: w }));
  };

  const setTaskFontWeight = async (task_font_weight) => {
    if (!user) return;
    const w = normalizeTaskFontWeight(task_font_weight);
    await supabase.from('user_settings').update({ task_font_weight: w }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, task_font_weight: w }));
  };

  const setTaskFontScale = async (task_font_scale) => {
    if (!user) return;
    const sc = normalizeTaskFontScale(task_font_scale);
    await supabase.from('user_settings').update({ task_font_scale: sc }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, task_font_scale: sc }));
  };

  const setBoardZoom = async (board_zoom) => {
    if (!user) return;
    const z = clampBoardZoom(board_zoom);
    await supabase.from('user_settings').update({ board_zoom: z }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, board_zoom: z }));
  };

  const setBoardDots = async (board_dots) => {
    if (!user) return;
    const v = !!board_dots;
    await supabase.from('user_settings').update({ board_dots: v }).eq('user_id', user.id);
    setSettings((s) => ({ ...s, board_dots: v }));
  };

  return {
    settings,
    setDaysCount,
    setNewTasksPosition,
    setNoDateListVisible,
    setCompletedVisible,
    setSidebarWidthPx,
    setHabitsSidebarWidthPx,
    setTaskFontWeight,
    setTaskFontScale,
    setBoardZoom,
    setBoardDots,
    loading,
  };
}
