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
/**
 * Every row written is announced twice (postgres_changes and the project
 * broadcast), and a move rewrites the places of whole columns: the boards are
 * read back once things have gone quiet for this long, not once per row.
 */
const SYNC_DELAY = 300;
/** The tables of the boards; touches have a hook of their own. */
const BOARD_TABLES = new Set(['kanban_columns', 'kanban_cards', 'kanban_labels', 'kanban_sources']);

export function useKanban(boardIds) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [columns, setColumns] = useState([]);
  const [cards, setCards] = useState([]);
  const [archived, setArchived] = useState([]);
  const [labels, setLabels] = useState([]);
  const [sources, setSources] = useState([]);
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

  // Every change is shown here at once and written behind it. A read of the
  // server that set out before a change made here, or while its writes were
  // still on their way, brings the board back as it was a moment earlier: put
  // on screen, it would throw a card just moved back where it came from for an
  // instant. Such a read is dropped, and the board is read again once the last
  // write is in.
  const pending = useRef(0); // writes on their way
  const changes = useRef(0); // changes made here, ever
  const lastRead = useRef(0);
  const syncTimer = useRef(null);
  const syncWanted = useRef(false);
  const fetchRef = useRef(null);

  const requestSync = useCallback((delay = SYNC_DELAY) => {
    syncWanted.current = true;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      // Not while writes are out: the last of them to land asks again.
      if (pending.current > 0) return;
      syncWanted.current = false;
      fetchRef.current?.();
    }, delay);
  }, []);

  /** Writes to the server, for a change already shown; resolves to what they returned. */
  const track = useCallback(async (work) => {
    pending.current += 1;
    changes.current += 1;
    try {
      return await work;
    } finally {
      pending.current -= 1;
      if (pending.current === 0 && syncWanted.current) requestSync();
    }
  }, [requestSync]);

  /** A write went wrong: what is on screen can no longer be trusted, so read it all back. */
  const resync = useCallback(() => requestSync(0), [requestSync]);

  const idsKey = useMemo(() => (boardIds || []).slice().sort().join(','), [boardIds]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      setColumns([]);
      putCards([]);
      setArchived([]);
      setLabels([]);
      setSources([]);
      setLoading(false);
      return;
    }
    const read = ++lastRead.current;
    const changesBefore = changes.current;
    const [colsRes, cardsRes, labelsRes, sourcesRes] = await Promise.all([
      supabase.from('kanban_columns').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_cards').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_labels').select('*').in('board_id', ids).order('position', { ascending: true }),
      supabase.from('kanban_sources').select('*').in('board_id', ids).order('position', { ascending: true }),
    ]);
    // A later read is on its way and will be the one to count.
    if (read !== lastRead.current) return;
    // A failed read says nothing about the boards; emptying them would.
    if (colsRes.error || cardsRes.error || labelsRes.error || sourcesRes.error) {
      setLoading(false);
      return;
    }
    if (pending.current > 0 || changes.current !== changesBefore) {
      requestSync();
      return;
    }
    const cols = colsRes.data;
    const lbls = labelsRes.data;
    const rows = (cardsRes.data || []).slice().sort(byPosition);
    // Whatever has served its 30 days in the archive is dropped here rather
    // than on a schedule somewhere: the boards are read often enough, and a
    // card nobody ever comes back for costs nothing while it waits.
    const expired = Date.now() - ARCHIVE_MS;
    const stale = rows.filter((c) => c.deleted_at && Date.parse(c.deleted_at) < expired);
    setColumns((cols || []).slice().sort(byPosition));
    putCards(rows.filter((c) => !c.deleted_at));
    setArchived(rows.filter((c) => c.deleted_at && Date.parse(c.deleted_at) >= expired).sort(byDeletedAt));
    setLabels((lbls || []).slice().sort(byPosition));
    setSources((sourcesRes.data || []).slice().sort(byPosition));
    setLoading(false);
    if (stale.length > 0) {
      await supabase.from('kanban_cards').delete().in('id', stale.map((c) => c.id));
    }
  }, [userId, idsKey, putCards, requestSync]);
  fetchRef.current = fetchAll;

  useEffect(() => () => clearTimeout(syncTimer.current), []);

  useEffect(() => {
    if (!userId) {
      setColumns([]);
      putCards([]);
      setArchived([]);
      setLabels([]);
      setSources([]);
      setLoading(false);
      return undefined;
    }
    fetchAll();
    const onChange = () => requestSync();
    const channel = supabase
      .channel(`kanban_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_labels', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_sources', filter: `user_id=eq.${userId}` }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll, putCards, requestSync]);

  // Changes made by a collaborator on a shared board. The same topic carries
  // the tasks and touches of the board, which do not change its cards.
  useEffect(() => {
    if (!userId || !idsKey) return undefined;
    return subscribeProjects(idsKey.split(','), (change) => {
      if (!change?.table || BOARD_TABLES.has(change.table)) requestSync();
    });
  }, [userId, idsKey, requestSync]);

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
    const { data, error } = await track(supabase.from('kanban_columns').insert(row).select().single());
    if (error || !data) {
      resync();
      return null;
    }
    setColumns((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, columns, track, resync]);

  const updateColumn = useCallback(async (id, patch) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await track(supabase
      .from('kanban_columns')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id));
    if (error) resync();
  }, [track, resync]);

  /**
   * The column goes. A card with a date does not belong to a column any more —
   * it lives in its day — so it only lets go of the column and stays on the
   * board; the rest go to the archive, the way a deleted card does.
   */
  const deleteColumn = useCallback(async (id) => {
    const inColumn = cardsRef.current.filter((c) => c.column_id === id);
    const dated = inColumn.filter((c) => c.due_date);
    const plain = inColumn.filter((c) => !c.due_date);
    const stamp = new Date().toISOString();
    setColumns((prev) => prev.filter((c) => c.id !== id));
    // The dated ones stay, cut loose from the column; the rest leave the board.
    patchCards((prev) => prev
      .filter((c) => !(c.column_id === id && !c.due_date))
      .map((c) => (c.column_id === id && c.due_date ? { ...c, column_id: null } : c)));
    if (plain.length > 0) {
      setArchived((prev) => [
        ...plain.map((c) => ({ ...c, deleted_at: stamp, archived_column_id: id, column_id: null })),
        ...prev,
      ].sort(byDeletedAt));
    }
    // Everything has to stop pointing at the column before it is dropped, or
    // the cascade takes it along. The dated cards merely let go of it; the
    // undated ones are archived on their way out.
    const writes = [];
    if (dated.length > 0) {
      writes.push(supabase
        .from('kanban_cards')
        .update({ column_id: null, updated_at: stamp })
        .eq('column_id', id)
        .not('due_date', 'is', null));
    }
    if (plain.length > 0) {
      writes.push(supabase
        .from('kanban_cards')
        .update({ deleted_at: stamp, archived_column_id: id, column_id: null, updated_at: stamp })
        .eq('column_id', id)
        .is('due_date', null));
    }
    const ok = await track((async () => {
      if (writes.length > 0) {
        const results = await Promise.all(writes);
        if (results.some((r) => r.error)) return false;
      }
      const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
      return !error;
    })());
    if (!ok) resync();
  }, [patchCards, track, resync]);

  const reorderColumns = useCallback(async (orderedIds) => {
    const was = new Map(columns.map((c) => [c.id, c.position]));
    setColumns((prev) => {
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      return prev
        .map((c) => (rank.has(c.id) ? { ...c, position: rank.get(c.id) } : c))
        .sort(byPosition);
    });
    const results = await track(Promise.all(
      orderedIds
        .map((id, i) => [id, i])
        .filter(([id, i]) => was.get(id) !== i)
        .map(([id, i]) => supabase.from('kanban_columns').update({ position: i }).eq('id', id)),
    ));
    if (results.some((r) => r.error)) resync();
  }, [columns, track, resync]);

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
    // In a day column the order is due_position, and a card without one goes
    // after every card placed there by hand.
    if (atStart && fields.due_date && !('due_position' in fields)) {
      const sameDay = cardsRef.current.filter((c) => c.board_id === boardId && c.due_date === fields.due_date);
      row.due_position = sameDay.length ? Math.min(...sameDay.map((c) => c.due_position ?? 0)) - 1 : 0;
    }
    const { data, error } = await track(supabase.from('kanban_cards').insert(row).select().single());
    if (error || !data) {
      resync();
      return null;
    }
    patchCards((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, patchCards, track, resync]);

  const updateCard = useCallback(async (id, patch) => {
    // A card given a new date has not been put anywhere in that day yet, so it
    // gives up the place it held in the old one and joins the end of the new.
    let full = 'due_date' in patch && !('due_position' in patch)
      ? { ...patch, due_position: null }
      : patch;
    // The star belongs to the reminder: taken off, it takes the star along, so
    // the next one set on the card does not come up starred.
    if ('remind_date' in full && !full.remind_date && !('remind_starred' in full)) {
      full = { ...full, remind_starred: false };
    }
    // A card losing its date returns to the stage board. If the column it used
    // to sit in has since been deleted, it joins the first one still standing,
    // so it never ends up with neither a date nor a place to be seen in.
    if ('due_date' in full && !full.due_date && !('column_id' in full)) {
      const card = cardsRef.current.find((c) => c.id === id);
      if (card && !card.column_id) {
        const home = columns.filter((c) => c.board_id === card.board_id).sort(byPosition)[0];
        if (home) {
          full = {
            ...full,
            column_id: home.id,
            position: nextPosition(cardsRef.current.filter((c) => c.column_id === home.id)),
          };
        }
      }
    }
    patchCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...full } : c)));
    const { error } = await track(supabase
      .from('kanban_cards')
      .update({ ...full, updated_at: new Date().toISOString() })
      .eq('id', id));
    if (error) resync();
  }, [patchCards, columns, track, resync]);

  /**
   * Shows a set of card patches at once and writes them behind, leaving out
   * the cards a patch would not change: a card moved to the top of a column
   * shifts every card below it, but only those that really did move are written.
   */
  const writeCards = useCallback(async (writes) => {
    const now = new Map(cardsRef.current.map((c) => [c.id, c]));
    const real = Array.from(writes.entries()).filter(([id, patch]) => {
      const card = now.get(id);
      return card && Object.keys(patch).some((k) => (card[k] ?? null) !== (patch[k] ?? null));
    });
    if (real.length === 0) return;
    const changed = new Map(real);
    patchCards((prev) => prev.map((c) => (changed.has(c.id) ? { ...c, ...changed.get(c.id) } : c)).sort(byPosition));
    const results = await track(Promise.all(
      real.map(([id, patch]) => supabase.from('kanban_cards').update(patch).eq('id', id)),
    ));
    if (results.some((r) => r.error)) resync();
  }, [patchCards, track, resync]);

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
    await writeCards(writes);
  }, [writeCards]);

  /** Off the board and into the archive, tasks and all. */
  const deleteCard = useCallback(async (id) => {
    const card = cardsRef.current.find((c) => c.id === id);
    const stamp = new Date().toISOString();
    patchCards((prev) => prev.filter((c) => c.id !== id));
    if (card) {
      const gone = { ...card, deleted_at: stamp, archived_column_id: card.column_id, column_id: null };
      setArchived((prev) => [gone, ...prev]);
    }
    const { error } = await track(supabase
      .from('kanban_cards')
      .update({
        deleted_at: stamp,
        archived_column_id: card?.column_id ?? null,
        column_id: null,
        updated_at: stamp,
      })
      .eq('id', id));
    if (error) resync();
  }, [patchCards, track, resync]);

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
    const { error } = await track(supabase
      .from('kanban_cards')
      .update({
        deleted_at: null,
        archived_column_id: null,
        column_id: columnId,
        position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id));
    if (error) resync();
  }, [archived, columns, patchCards, track, resync]);

  const purgeCard = useCallback(async (id) => {
    setArchived((prev) => prev.filter((c) => c.id !== id));
    const { error } = await track(supabase.from('kanban_cards').delete().eq('id', id));
    if (error) resync();
  }, [track, resync]);

  const purgeArchive = useCallback(async (boardId) => {
    const ids = archived.filter((c) => c.board_id === boardId).map((c) => c.id);
    if (ids.length === 0) return;
    setArchived((prev) => prev.filter((c) => c.board_id !== boardId));
    const { error } = await track(supabase.from('kanban_cards').delete().in('id', ids));
    if (error) resync();
  }, [archived, track, resync]);

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
    const { data, error } = await track(supabase.from('kanban_labels').insert(row).select().single());
    if (error || !data) {
      resync();
      return null;
    }
    setLabels((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, labels, track, resync]);

  const updateLabel = useCallback(async (id, patch) => {
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await track(supabase
      .from('kanban_labels')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id));
    if (error) resync();
  }, [track, resync]);

  /** Drops the label and takes it off every card that wore it. */
  const deleteLabel = useCallback(async (id) => {
    setLabels((prev) => prev.filter((l) => l.id !== id));
    const wearing = cardsRef.current.filter((c) => (c.label_ids || []).includes(id));
    patchCards((prev) => prev.map((c) => (
      (c.label_ids || []).includes(id)
        ? { ...c, label_ids: c.label_ids.filter((x) => x !== id) }
        : c
    )));
    const results = await track(Promise.all([
      supabase.from('kanban_labels').delete().eq('id', id),
      ...wearing.map((c) => supabase
        .from('kanban_cards')
        .update({ label_ids: (c.label_ids || []).filter((x) => x !== id) })
        .eq('id', c.id)),
    ]));
    if (results.some((r) => r.error)) resync();
  }, [patchCards, track, resync]);

  const addSource = useCallback(async (boardId, title) => {
    if (!userId || !boardId) return null;
    const row = {
      user_id: userId,
      board_id: boardId,
      title,
      position: nextPosition(sources.filter((s) => s.board_id === boardId)),
    };
    const { data, error } = await track(supabase.from('kanban_sources').insert(row).select().single());
    if (error || !data) {
      resync();
      return null;
    }
    setSources((prev) => [...prev, data].sort(byPosition));
    return data;
  }, [userId, sources, track, resync]);

  const updateSource = useCallback(async (id, patch) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await track(supabase
      .from('kanban_sources')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id));
    if (error) resync();
  }, [track, resync]);

  /** Drops the source; the cards that came from it are left without one by the database. */
  const deleteSource = useCallback(async (id) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    patchCards((prev) => prev.map((c) => (c.source_id === id ? { ...c, source_id: null } : c)));
    const { error } = await track(supabase.from('kanban_sources').delete().eq('id', id));
    if (error) resync();
  }, [patchCards, track, resync]);

  /** The sources of a board in the order of `ids`; only those whose place changed are written. */
  const reorderSources = useCallback(async (ids) => {
    const at = new Map(ids.map((id, i) => [id, i]));
    const moved = sources.filter((s) => at.has(s.id) && s.position !== at.get(s.id));
    if (moved.length === 0) return;
    setSources((prev) => prev.map((s) => (at.has(s.id) ? { ...s, position: at.get(s.id) } : s)).sort(byPosition));
    const results = await track(Promise.all(moved.map((s) => supabase
      .from('kanban_sources')
      .update({ position: at.get(s.id), updated_at: new Date().toISOString() })
      .eq('id', s.id))));
    if (results.some((r) => r.error)) resync();
  }, [sources, track, resync]);

  /**
   * Put a card at `index` of `columnId`, renumbering the column it joins. The
   * column it left keeps its numbers: a gap where it stood changes no order.
   */
  const moveCard = useCallback(async (cardId, columnId, index) => {
    const all = cardsRef.current;
    if (!all.some((c) => c.id === cardId)) return;
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
    await writeCards(writes);
  }, [writeCards]);

  /**
   * A card handed over to another board. It lands at the end of that board's
   * first column and leaves its labels and source behind — they belong to a
   * board and would mean nothing on the new one — while its tasks and the
   * history of its touches travel with it.
   */
  const moveCardToBoard = useCallback(async (cardId, boardId) => {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card || !boardId || card.board_id === boardId) return;
    const home = columns.filter((c) => c.board_id === boardId).sort(byPosition)[0];
    if (!home) return;
    const patch = {
      board_id: boardId,
      column_id: home.id,
      position: nextPosition(cardsRef.current.filter((c) => c.column_id === home.id)),
      label_ids: [],
      source_id: null,
      due_position: null,
    };
    patchCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)).sort(byPosition));
    const [moved, carried, touched] = await track(Promise.all([
      supabase
        .from('kanban_cards')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', cardId),
      supabase.from('tasks').update({ project_id: boardId }).eq('card_id', cardId),
      supabase.from('kanban_touches').update({ board_id: boardId }).eq('card_id', cardId),
    ]));
    if (moved.error || carried.error || touched.error) resync();
  }, [columns, patchCards, track, resync]);

  return {
    columns,
    cards,
    archived,
    labels,
    sources,
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
    moveCardToBoard,
    planDay,
    addLabel,
    updateLabel,
    deleteLabel,
    addSource,
    updateSource,
    deleteSource,
    reorderSources,
    refetch: fetchAll,
  };
}
