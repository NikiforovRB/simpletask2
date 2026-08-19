import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';

/**
 * Columns, cards and labels of every kanban board the user can reach (their
 * own and the shared ones). `boardIds` comes from the project list, so the
 * hook does not have to work out access on its own.
 *
 * The lists are kept ordered by `position`, and every mutation is applied
 * locally first: a board is dragged around a lot, and waiting for a round trip
 * on each move would make it feel sticky.
 */
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);
/** Newest first: the archive is read from the top. */
const byDeletedAt = (a, b) => Date.parse(b.deleted_at) - Date.parse(a.deleted_at);

/** How long a deleted card is kept before it is really gone. */
export const ARCHIVE_DAYS = 30;
const ARCHIVE_MS = ARCHIVE_DAYS * 24 * 60 * 60 * 1000;

export function useKanban(boardIds) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [columns, setColumns] = useState([]);
  const [cards, setCards] = useState([]);
  const [archived, setArchived] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  // Cards as they stand right now, including the ones added a moment ago:
  // typing card after card into a column is faster than a re-render, and the
  // next position has to count the ones that are still on their way in.
  const cardsRef = useRef([]);
  const putCards = useCallback((next) => {
    cardsRef.current = next;
    setCards(next);
  }, []);
  const patchCards = useCallback((fn) => {
    putCards(fn(cardsRef.current));
  }, [putCards]);

  const idsKey = useMemo(() => (boardIds || []).slice().sort().join(','), [boardIds]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      setColumns([]);
      putCards([]);
      setArchived([]);
      setLabels([]);
      setLoading(false);
      return;
    }
    const [{ data: cols }, { data: crds }, { data: lbls }] = await Promise.all([
      supabase.from('kanban_columns').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_cards').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_labels').select('*').in('board_id', ids).order('position', { ascending: true }),
    ]);
    const rows = (crds || []).slice().sort(byPosition);
    // Whatever has served its 30 days in the archive is dropped here rather
    // than on a schedule somewhere: the boards are read often enough, and a
    // card nobody ever comes back for costs nothing while it waits.
    const expired = Date.now() - ARCHIVE_MS;
    const stale = rows.filter((c) => c.deleted_at && Date.parse(c.deleted_at) < expired);
    setColumns((cols || []).slice().sort(byPosition));
    putCards(rows.filter((c) => !c.deleted_at));
    setArchived(rows.filter((c) => c.deleted_at && Date.parse(c.deleted_at) >= expired).sort(byDeletedAt));
    setLabels((lbls || []).slice().sort(byPosition));
    setLoading(false);
    if (stale.length > 0) {
      await supabase.from('kanban_cards').delete().in('id', stale.map((c) => c.id));
    }
  }, [userId, idsKey, putCards]);

  useEffect(() => {
    if (!userId) {
      setColumns([]);
      putCards([]);
      setArchived([]);
      setLabels([]);
      setLoading(false);
      return undefined;
    }
    fetchAll();
    const channel = supabase
      .channel(`kanban_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns', filter: `user_id=eq.${userId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `user_id=eq.${userId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_labels', filter: `user_id=eq.${userId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll, putCards]);

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

  /** The column goes; its cards go to the archive rather than with it. */
  const deleteColumn = useCallback(async (id) => {
    const doomed = cardsRef.current.filter((c) => c.column_id === id);
    const stamp = new Date().toISOString();
    setColumns((prev) => prev.filter((c) => c.id !== id));
    patchCards((prev) => prev.filter((c) => c.column_id !== id));
    if (doomed.length > 0) {
      setArchived((prev) => [
        ...doomed.map((c) => ({ ...c, deleted_at: stamp, archived_column_id: id, column_id: null })),
        ...prev,
      ].sort(byDeletedAt));
      // They have to leave the column before it is dropped, or the cascade
      // takes them along.
      const { error } = await supabase
        .from('kanban_cards')
        .update({ deleted_at: stamp, archived_column_id: id, column_id: null, updated_at: stamp })
        .eq('column_id', id);
      if (error) {
        await fetchAll();
        return;
      }
    }
    const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll, patchCards]);

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
    const { atStart, ...fields } = patch;
    const siblings = cardsRef.current.filter((c) => c.column_id === columnId);
    const row = {
      user_id: userId,
      board_id: boardId,
      column_id: columnId,
      title: '',
      description: '',
      border_color: null,
      ...fields,
      position: atStart
        ? (siblings.length ? Math.min(...siblings.map((c) => c.position ?? 0)) - 1 : 0)
        : nextPosition(siblings),
    };
    const { data, error } = await supabase.from('kanban_cards').insert(row).select().single();
    if (error || !data) {
      await fetchAll();
      return null;
    }
    patchCards((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, fetchAll, patchCards]);

  const updateCard = useCallback(async (id, patch) => {
    // A card given a new date has not been put anywhere in that day yet, so it
    // gives up the place it held in the old one and joins the end of the new.
    const full = 'due_date' in patch && !('due_position' in patch)
      ? { ...patch, due_position: null }
      : patch;
    patchCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...full } : c)));
    const { error } = await supabase
      .from('kanban_cards')
      .update({ ...full, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll, patchCards]);

  /**
   * Lay out one day: `orderedIds` is every card due that day in the order they
   * are to stand in, and `movedId` — the one just dropped there — is given the
   * date as well, in case it came from another day or from the board.
   */
  const planDay = useCallback(async (dueDate, orderedIds, movedId) => {
    const writes = new Map();
    orderedIds.forEach((id, i) => {
      writes.set(id, id === movedId ? { due_position: i, due_date: dueDate } : { due_position: i });
    });
    patchCards((prev) => prev.map((c) => (writes.has(c.id) ? { ...c, ...writes.get(c.id) } : c)));
    const results = await Promise.all(
      Array.from(writes.entries()).map(([id, patch]) => supabase.from('kanban_cards').update(patch).eq('id', id)),
    );
    if (results.some((r) => r.error)) await fetchAll();
  }, [fetchAll, patchCards]);

  /** Off the board and into the archive, tasks and all. */
  const deleteCard = useCallback(async (id) => {
    const card = cardsRef.current.find((c) => c.id === id);
    const stamp = new Date().toISOString();
    patchCards((prev) => prev.filter((c) => c.id !== id));
    if (card) {
      const gone = { ...card, deleted_at: stamp, archived_column_id: card.column_id, column_id: null };
      setArchived((prev) => [gone, ...prev]);
    }
    const { error } = await supabase
      .from('kanban_cards')
      .update({
        deleted_at: stamp,
        archived_column_id: card?.column_id ?? null,
        column_id: null,
        updated_at: stamp,
      })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll, patchCards]);

  /** Back to the column it was deleted from, or to the first one left. */
  const restoreCard = useCallback(async (id) => {
    const card = archived.find((c) => c.id === id);
    if (!card) return;
    const home = columns
      .filter((c) => c.board_id === card.board_id)
      .sort(byPosition);
    const columnId = home.some((c) => c.id === card.archived_column_id)
      ? card.archived_column_id
      : home[0]?.id;
    if (!columnId) return;
    const position = nextPosition(cardsRef.current.filter((c) => c.column_id === columnId));
    setArchived((prev) => prev.filter((c) => c.id !== id));
    patchCards((prev) => [
      ...prev,
      { ...card, deleted_at: null, archived_column_id: null, column_id: columnId, position },
    ].sort(byPosition));
    const { error } = await supabase
      .from('kanban_cards')
      .update({
        deleted_at: null,
        archived_column_id: null,
        column_id: columnId,
        position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) await fetchAll();
  }, [archived, columns, fetchAll, patchCards]);

  const purgeCard = useCallback(async (id) => {
    setArchived((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('kanban_cards').delete().eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  const purgeArchive = useCallback(async (boardId) => {
    const ids = archived.filter((c) => c.board_id === boardId).map((c) => c.id);
    if (ids.length === 0) return;
    setArchived((prev) => prev.filter((c) => c.board_id !== boardId));
    const { error } = await supabase.from('kanban_cards').delete().in('id', ids);
    if (error) await fetchAll();
  }, [archived, fetchAll]);

  const addLabel = useCallback(async (boardId, patch = {}) => {
    if (!userId || !boardId) return null;
    const siblings = labels.filter((l) => l.board_id === boardId);
    const row = {
      user_id: userId,
      board_id: boardId,
      title: patch.title ?? '',
      color: patch.color ?? '#5a86ee',
      position: nextPosition(siblings),
    };
    const { data, error } = await supabase.from('kanban_labels').insert(row).select().single();
    if (error || !data) {
      await fetchAll();
      return null;
    }
    setLabels((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, labels, fetchAll]);

  const updateLabel = useCallback(async (id, patch) => {
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase
      .from('kanban_labels')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll]);

  /** Drops the label and takes it off every card that wore it. */
  const deleteLabel = useCallback(async (id) => {
    setLabels((prev) => prev.filter((l) => l.id !== id));
    const wearing = cardsRef.current.filter((c) => (c.label_ids || []).includes(id));
    patchCards((prev) => prev.map((c) => (
      (c.label_ids || []).includes(id)
        ? { ...c, label_ids: c.label_ids.filter((x) => x !== id) }
        : c
    )));
    const results = await Promise.all([
      supabase.from('kanban_labels').delete().eq('id', id),
      ...wearing.map((c) => supabase
        .from('kanban_cards')
        .update({ label_ids: (c.label_ids || []).filter((x) => x !== id) })
        .eq('id', c.id)),
    ]);
    if (results.some((r) => r.error)) await fetchAll();
  }, [fetchAll, patchCards]);

  /**
   * Put a card at `index` of `columnId`, renumbering the cards of the columns
   * it left and joined so their positions stay 0..n.
   */
  const moveCard = useCallback(async (cardId, columnId, index) => {
    const all = cardsRef.current;
    const moved = all.find((c) => c.id === cardId);
    if (!moved) return;
    const fromColumnId = moved.column_id;
    const target = all
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
      all
        .filter((c) => c.column_id === fromColumnId && c.id !== cardId)
        .sort(byPosition)
        .forEach((c, i) => writes.set(c.id, { position: i }));
    }

    patchCards((prev) => prev.map((c) => (writes.has(c.id) ? { ...c, ...writes.get(c.id) } : c)).sort(byPosition));
    const results = await Promise.all(
      Array.from(writes.entries()).map(([id, patch]) => supabase.from('kanban_cards').update(patch).eq('id', id)),
    );
    if (results.some((r) => r.error)) await fetchAll();
  }, [fetchAll, patchCards]);

  return {
    columns,
    cards,
    archived,
    labels,
    loading,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    addCard,
    updateCard,
    deleteCard,
    restoreCard,
    purgeCard,
    purgeArchive,
    moveCard,
    planDay,
    addLabel,
    updateLabel,
    deleteLabel,
    refetch: fetchAll,
  };
}
