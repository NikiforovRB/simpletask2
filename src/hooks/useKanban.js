import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';

/**
 * Columns and cards of every kanban board the user can reach (their own and
 * the shared ones). `boardIds` comes from the project list, so the hook does
 * not have to work out access on its own.
 *
 * Both lists are kept ordered by `position`, and every mutation is applied
 * locally first: a board is dragged around a lot, and waiting for a round trip
 * on each move would make it feel sticky.
 */
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

export function useKanban(boardIds) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [columns, setColumns] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const idsKey = useMemo(() => (boardIds || []).slice().sort().join(','), [boardIds]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      setColumns([]);
      setCards([]);
      setLoading(false);
      return;
    }
    const [{ data: cols }, { data: crds }] = await Promise.all([
      supabase.from('kanban_columns').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_cards').select('*').in('board_id', ids).order('position', { ascending: true }),
    ]);
    setColumns((cols || []).slice().sort(byPosition));
    setCards((crds || []).slice().sort(byPosition));
    setLoading(false);
  }, [userId, idsKey]);

  useEffect(() => {
    if (!userId) {
      setColumns([]);
      setCards([]);
      setLoading(false);
      return undefined;
    }
    fetchAll();
    const channel = supabase
      .channel(`kanban_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns', filter: `user_id=eq.${userId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `user_id=eq.${userId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll]);

  // Changes made by a collaborator on a shared board.
  useEffect(() => {
    if (!userId || !idsKey) return undefined;
    return subscribeProjects(idsKey.split(','), fetchAll);
  }, [userId, idsKey, fetchAll]);

  const nextPosition = (list) => (list.length ? Math.max(...list.map((r) => r.position ?? 0)) + 1 : 0);

  const addColumn = useCallback(async (boardId, patch = {}) => {
    if (!userId || !boardId) return null;
    const siblings = columns.filter((c) => c.board_id === boardId);
    const row = {
      user_id: userId,
      board_id: boardId,
      title: patch.title ?? '',
      accent_color: patch.accent_color ?? '#5a86ee',
      position: nextPosition(siblings),
    };
    const { data, error } = await supabase.from('kanban_columns').insert(row).select().single();
    if (error || !data) {
      await fetchAll();
      return null;
    }
    setColumns((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, columns, fetchAll]);

  const updateColumn = useCallback(async (id, patch) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase
      .from('kanban_columns')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  const deleteColumn = useCallback(async (id) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setCards((prev) => prev.filter((c) => c.column_id !== id));
    const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  const reorderColumns = useCallback(async (orderedIds) => {
    setColumns((prev) => {
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      return prev
        .map((c) => (rank.has(c.id) ? { ...c, position: rank.get(c.id) } : c))
        .sort(byPosition);
    });
    await Promise.all(
      orderedIds.map((id, i) => supabase.from('kanban_columns').update({ position: i }).eq('id', id)),
    );
  }, []);

  const addCard = useCallback(async (boardId, columnId, patch = {}) => {
    if (!userId || !boardId || !columnId) return null;
    const siblings = cards.filter((c) => c.column_id === columnId);
    const row = {
      user_id: userId,
      board_id: boardId,
      column_id: columnId,
      title: patch.title ?? '',
      description: patch.description ?? '',
      border_color: patch.border_color ?? null,
      position: patch.atStart
        ? (siblings.length ? Math.min(...siblings.map((c) => c.position ?? 0)) - 1 : 0)
        : nextPosition(siblings),
    };
    const { data, error } = await supabase.from('kanban_cards').insert(row).select().single();
    if (error || !data) {
      await fetchAll();
      return null;
    }
    setCards((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, cards, fetchAll]);

  const updateCard = useCallback(async (id, patch) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase
      .from('kanban_cards')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  const deleteCard = useCallback(async (id) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('kanban_cards').delete().eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  /**
   * Put a card at `index` of `columnId`, renumbering the cards of the columns
   * it left and joined so their positions stay 0..n.
   */
  const moveCard = useCallback(async (cardId, columnId, index) => {
    const moved = cards.find((c) => c.id === cardId);
    if (!moved) return;
    const fromColumnId = moved.column_id;
    const target = cards
      .filter((c) => c.column_id === columnId && c.id !== cardId)
      .sort(byPosition)
      .map((c) => c.id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, cardId);

    const writes = new Map(); // card id -> patch
    target.forEach((id, i) => {
      const patch = { position: i };
      if (id === cardId) patch.column_id = columnId;
      writes.set(id, patch);
    });
    if (fromColumnId !== columnId) {
      cards
        .filter((c) => c.column_id === fromColumnId && c.id !== cardId)
        .sort(byPosition)
        .forEach((c, i) => writes.set(c.id, { position: i }));
    }

    setCards((prev) => prev.map((c) => (writes.has(c.id) ? { ...c, ...writes.get(c.id) } : c)).sort(byPosition));
    const results = await Promise.all(
      Array.from(writes.entries()).map(([id, patch]) => supabase.from('kanban_cards').update(patch).eq('id', id)),
    );
    if (results.some((r) => r.error)) await fetchAll();
  }, [cards, fetchAll]);

  return {
    columns,
    cards,
    loading,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    refetch: fetchAll,
  };
}
