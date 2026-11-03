import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';
import { newId } from '../lib/crm';

/** Oldest first: a history is read from the top down to today. */
const byTime = (a, b) => (Date.parse(a.touched_at) - Date.parse(b.touched_at))
  || String(a.created_at).localeCompare(String(b.created_at));

// The API hands rows out a thousand at a time.
const PAGE = 1000;

/**
 * The touches of one CRM board: the history of every client on it and,
 * through the touches that closed a reminder, the work done each day. Only
 * the board on screen is loaded — nothing else needs them. Every change is
 * shown at once and written behind it.
 */
export function useKanbanTouches(boardId) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [touches, setTouches] = useState([]);
  // A board left before its touches arrived must not have them shown on the next.
  const request = useRef(0);

  const fetchAll = useCallback(async () => {
    const mine = ++request.current;
    if (!userId || !boardId) {
      setTouches([]);
      return;
    }
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('kanban_touches')
        .select('*')
        .eq('board_id', boardId)
        .order('touched_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || mine !== request.current) return;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    setTouches(rows.sort(byTime));
  }, [userId, boardId]);

  useEffect(() => {
    fetchAll();
    if (!userId || !boardId) return undefined;
    // The board's broadcast covers this device, the others of the same user,
    // and everyone the board is shared with.
    return subscribeProjects([boardId], (change) => {
      if (change?.table === 'kanban_touches') fetchAll();
    });
  }, [userId, boardId, fetchAll]);

  const addTouch = useCallback(async (fields) => {
    if (!userId) return null;
    const now = new Date().toISOString();
    const row = {
      id: newId(),
      user_id: userId,
      body: '',
      touched_at: now,
      closed_reminder: null,
      ...fields,
      created_at: now,
      updated_at: now,
    };
    setTouches((prev) => [...prev, row].sort(byTime));
    const { error } = await supabase.from('kanban_touches').insert({
      id: row.id,
      user_id: row.user_id,
      board_id: row.board_id,
      card_id: row.card_id,
      body: row.body,
      touched_at: row.touched_at,
      closed_reminder: row.closed_reminder,
    });
    if (error) await fetchAll();
    return row;
  }, [userId, fetchAll]);

  const updateTouch = useCallback(async (id, patch) => {
    setTouches((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort(byTime));
    const { error } = await supabase
      .from('kanban_touches')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  const deleteTouch = useCallback(async (id) => {
    setTouches((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('kanban_touches').delete().eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  return { touches, addTouch, updateTouch, deleteTouch };
}
