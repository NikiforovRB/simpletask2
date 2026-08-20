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

function normalizeTheme(v) {
  return v === 'light' ? 'light' : 'dark';
}

/** A settings column holding a plain object, safe against nulls and arrays. */
function normalizeMap(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// Colours offered for the filled areas on the calendar focus scale.
export const FOCUS_SCALE_COLORS = ['#15c466', '#5a86ee'];

function normalizeFocusColor(v) {
  const c = String(v || '').toLowerCase();
  return FOCUS_SCALE_COLORS.includes(c) ? c : FOCUS_SCALE_COLORS[0];
}

// Calendar timeline scale: snap to 0.2 steps within [1, 3].
function clampScale(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  const snapped = Math.round(v / 0.2) * 0.2;
  return Math.max(1, Math.min(3, Math.round(snapped * 10) / 10));
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
    theme: 'dark',
    calendar_scale: 1,
    calendar_show_checkboxes: false,
    calendar_two_columns: false,
    calendar_focus_scale: false,
    calendar_focus_color: FOCUS_SCALE_COLORS[0],
    focus_timer_show_total: false,
    show_reputation_in_lists: false,
    reputation_in_completed: false,
    kanban_date_filters: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetch = async () => {
      // Select '*' so that a not-yet-applied migration (missing calendar_*
      // columns) doesn't error out and wipe persisted settings back to defaults.
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
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
          theme: normalizeTheme(data.theme),
          calendar_scale: clampScale(data.calendar_scale),
          calendar_show_checkboxes: data.calendar_show_checkboxes === true,
          calendar_two_columns: data.calendar_two_columns === true,
          calendar_focus_scale: data.calendar_focus_scale === true,
          calendar_focus_color: normalizeFocusColor(data.calendar_focus_color),
          focus_timer_show_total: data.focus_timer_show_total === true,
          show_reputation_in_lists: data.show_reputation_in_lists === true,
          reputation_in_completed: data.reputation_in_completed === true,
          kanban_date_filters: normalizeMap(data.kanban_date_filters),
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
          theme: 'dark',
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
          theme: 'dark',
          calendar_scale: 1,
          calendar_show_checkboxes: false,
          calendar_two_columns: false,
          calendar_focus_scale: false,
          calendar_focus_color: FOCUS_SCALE_COLORS[0],
          focus_timer_show_total: false,
          show_reputation_in_lists: false,
          reputation_in_completed: false,
          kanban_date_filters: {},
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

  const setTheme = async (theme) => {
    if (!user) return;
    const v = normalizeTheme(theme);
    setSettings((s) => ({ ...s, theme: v }));
    await supabase.from('user_settings').update({ theme: v }).eq('user_id', user.id);
  };

  const setCalendarScale = async (scale) => {
    if (!user) return;
    const v = clampScale(scale);
    setSettings((s) => ({ ...s, calendar_scale: v }));
    await supabase.from('user_settings').update({ calendar_scale: v }).eq('user_id', user.id);
  };

  const setCalendarShowCheckboxes = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, calendar_show_checkboxes: val }));
    await supabase.from('user_settings').update({ calendar_show_checkboxes: val }).eq('user_id', user.id);
  };

  const setCalendarTwoColumns = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, calendar_two_columns: val }));
    await supabase.from('user_settings').update({ calendar_two_columns: val }).eq('user_id', user.id);
  };

  const setCalendarFocusScale = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, calendar_focus_scale: val }));
    await supabase.from('user_settings').update({ calendar_focus_scale: val }).eq('user_id', user.id);
  };

  const setCalendarFocusColor = async (v) => {
    if (!user) return;
    const val = normalizeFocusColor(v);
    setSettings((s) => ({ ...s, calendar_focus_color: val }));
    await supabase.from('user_settings').update({ calendar_focus_color: val }).eq('user_id', user.id);
  };

  const setFocusTimerShowTotal = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, focus_timer_show_total: val }));
    await supabase.from('user_settings').update({ focus_timer_show_total: val }).eq('user_id', user.id);
  };

  const setShowReputationInLists = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, show_reputation_in_lists: val }));
    await supabase.from('user_settings').update({ show_reputation_in_lists: val }).eq('user_id', user.id);
  };

  const setReputationInCompleted = async (v) => {
    if (!user) return;
    const val = !!v;
    setSettings((s) => ({ ...s, reputation_in_completed: val }));
    await supabase.from('user_settings').update({ reputation_in_completed: val }).eq('user_id', user.id);
  };

  /** How one kanban board is filtered by date; null puts it back to columns. */
  const setKanbanDateFilter = async (boardId, filterId) => {
    if (!user || !boardId) return;
    const all = { ...normalizeMap(settings.kanban_date_filters) };
    if (filterId) all[boardId] = filterId;
    else delete all[boardId];
    setSettings((s) => ({ ...s, kanban_date_filters: all }));
    await supabase.from('user_settings').update({ kanban_date_filters: all }).eq('user_id', user.id);
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
    setTheme,
    setCalendarScale,
    setCalendarShowCheckboxes,
    setCalendarTwoColumns,
    setCalendarFocusScale,
    setCalendarFocusColor,
    setFocusTimerShowTotal,
    setShowReputationInLists,
    setReputationInCompleted,
    setKanbanDateFilter,
    loading,
  };
}
