import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const VALID_KINDS = new Set(['goal', 'morning', 'evening', 'action', 'day']);

function emptyState() {
  return { items: [], notes: {} };
}

export function useGoalPlan() {
  const { user } = useAuth();
  const [state, setState] = useState(emptyState());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setState(emptyState());
      setLoading(false);
      return;
    }
    const [itemsRes, notesRes] = await Promise.all([
      supabase
        .from('goal_plan_items')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('goal_plan_day_notes').select('*').eq('user_id', user.id),
    ]);
    const items = itemsRes.data || [];
    const notes = {};
    (notesRes.data || []).forEach((row) => {
      const ds = typeof row.entry_date === 'string' ? row.entry_date.slice(0, 10) : row.entry_date;
      notes[ds] = {
        start_text: row.start_text || '',
        end_text: row.end_text || '',
        start_color: row.start_color || null,
        end_color: row.end_color || null,
      };
    });
    setState({ items, notes });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setState(emptyState());
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAll();
  }, [user?.id, fetchAll]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('goal_plan_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goal_plan_items', filter: `user_id=eq.${user.id}` },
        () => fetchAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goal_plan_day_notes', filter: `user_id=eq.${user.id}` },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, fetchAll]);

  const itemsByKind = useMemo(() => {
    const map = { goal: [], morning: [], evening: [], action: [], day: [] };
    for (const it of state.items) {
      if (!VALID_KINDS.has(it.kind)) continue;
      map[it.kind].push(it);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    return map;
  }, [state.items]);

  const addItem = useCallback(
    async ({ kind, text = '', parent_id = null, entry_date = null, goal_id = null, position = null, text_color = null }) => {
      if (!user?.id) return null;
      if (!VALID_KINDS.has(kind)) return null;
      let pos = position;
      if (pos == null) {
        const list = state.items.filter((it) => {
          if (it.kind !== kind) return false;
          if ((it.parent_id ?? null) !== (parent_id ?? null)) return false;
          if (kind === 'day' && (it.entry_date ?? null) !== (entry_date ?? null)) return false;
          return true;
        });
        pos = list.length ? Math.max(...list.map((it) => it.position ?? 0)) + 1 : 0;
      }
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tmp-${Math.random().toString(16).slice(2)}`;
      const row = {
        id: newId,
        user_id: user.id,
        kind,
        parent_id: parent_id || null,
        text: typeof text === 'string' ? text : '',
        position: pos,
        entry_date: kind === 'day' ? entry_date : null,
        goal_id: goal_id || null,
        text_color: text_color || null,
      };
      const optimistic = { ...row, completed_at: null, created_at: new Date().toISOString() };
      setState((prev) => ({ ...prev, items: [...prev.items, optimistic] }));
      const { data, error } = await supabase.from('goal_plan_items').insert(row).select().single();
      if (error || !data) {
        setState((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== newId) }));
        return null;
      }
      // Merge any server-side defaults without replacing the id, so the input keeps focus.
      setState((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === newId ? { ...it, ...data } : it)),
      }));
      return newId;
    },
    [user?.id, state.items]
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (!user?.id) return;
      setState((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      }));
      await supabase.from('goal_plan_items').update(patch).eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  /**
   * Insert a new item directly AFTER the item identified by `afterId` in the
   * same list (same kind + parent_id + entry_date). Re-indexes the list's
   * positions so the result is the natural 0..N continuous ordering.
   * Falls back to `addItem` (append at end) if `afterId` cannot be found.
   */
  const addItemAfter = useCallback(
    async ({
      afterId,
      kind,
      parent_id = null,
      entry_date = null,
      text = '',
      text_color = null,
    }) => {
      if (!user?.id) return null;
      if (!VALID_KINDS.has(kind)) return null;
      const all = stateRef.current?.items || [];

      const sameList = (it) =>
        it.kind === kind &&
        (it.parent_id ?? null) === (parent_id ?? null) &&
        (kind !== 'day' || (it.entry_date ?? null) === (entry_date ?? null));

      const list = all.filter(sameList).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const idx = list.findIndex((it) => it.id === afterId);
      if (idx === -1) {
        return await addItem({ kind, parent_id, entry_date, text, text_color });
      }

      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tmp-${Math.random().toString(16).slice(2)}`;

      const row = {
        id: newId,
        user_id: user.id,
        kind,
        parent_id: parent_id || null,
        text: typeof text === 'string' ? text : '',
        position: idx + 1,
        entry_date: kind === 'day' ? entry_date : null,
        goal_id: null,
        text_color: text_color || null,
      };
      const optimistic = {
        ...row,
        completed_at: null,
        created_at: new Date().toISOString(),
      };

      // Build the new ordering with the optimistic item inserted right after `afterId`,
      // then re-index positions so they're continuous 0..N.
      const newOrder = [...list];
      newOrder.splice(idx + 1, 0, optimistic);
      const newPos = new Map(newOrder.map((it, i) => [it.id, i]));

      setState((prev) => ({
        ...prev,
        items: [
          ...prev.items.map((it) =>
            newPos.has(it.id) && it.id !== newId ? { ...it, position: newPos.get(it.id) } : it
          ),
          optimistic,
        ],
      }));

      const { data, error } = await supabase
        .from('goal_plan_items')
        .insert(row)
        .select()
        .single();

      if (error || !data) {
        // Rollback the optimistic insert.
        setState((prev) => ({
          ...prev,
          items: prev.items.filter((it) => it.id !== newId),
        }));
        return null;
      }

      // Persist position changes for shifted items whose position actually moved.
      const positionUpdates = list
        .map((it) => ({ id: it.id, position: newPos.get(it.id) }))
        .filter((u) => {
          const orig = list.find((o) => o.id === u.id);
          return orig && (orig.position ?? 0) !== u.position;
        });

      await Promise.all(
        positionUpdates.map(({ id, position }) =>
          supabase
            .from('goal_plan_items')
            .update({ position })
            .eq('id', id)
            .eq('user_id', user.id)
        )
      );

      // Merge server defaults onto the client-generated id (preserve id to keep focus).
      setState((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === newId ? { ...it, ...data } : it)),
      }));

      return newId;
    },
    [user?.id, addItem]
  );

  const toggleComplete = useCallback(
    async (id) => {
      const cur = state.items.find((it) => it.id === id);
      if (!cur) return;
      const nextVal = cur.completed_at ? null : new Date().toISOString();
      await updateItem(id, { completed_at: nextVal });
    },
    [state.items, updateItem]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!user?.id) return;
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.id !== id && it.parent_id !== id),
      }));
      await supabase.from('goal_plan_items').delete().eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  const reorderItems = useCallback(
    async (orderedIds) => {
      if (!user?.id || !orderedIds?.length) return;
      const lookup = new Map(orderedIds.map((id, idx) => [id, idx]));
      setState((prev) => ({
        ...prev,
        items: prev.items.map((it) => (lookup.has(it.id) ? { ...it, position: lookup.get(it.id) } : it)),
      }));
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('goal_plan_items').update({ position: idx }).eq('id', id).eq('user_id', user.id)
        )
      );
    },
    [user?.id]
  );

  /**
   * Move a day item to a different day (and/or position). Top-level items
   * stay top-level; subtasks are promoted to top-level on the target day
   * (their `parent_id` is cleared so they show up directly in the day list).
   * Reassigns positions in both source and target days so the result matches
   * the optimistic ordering.
   */
  const moveDayItem = useCallback(
    async (itemId, targetDate, targetIndex) => {
      if (!user?.id) return;
      const all = stateRef.current?.items || [];
      const item = all.find((it) => it.id === itemId);
      if (!item || item.kind !== 'day') return;
      const sourceDate = item.entry_date;
      const wasSubtask = !!item.parent_id;
      // Only treat as in-place reorder when both source and target are the
      // same top-level day list. Promoting a subtask is never "same day".
      const sameDay = sourceDate === targetDate && !wasSubtask;

      const inDay = (date) =>
        all
          .filter((it) => it.kind === 'day' && !it.parent_id && it.entry_date === date)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const targetList = inDay(targetDate).filter((it) => it.id !== itemId);
      const clampedIdx = Math.max(0, Math.min(targetIndex, targetList.length));
      targetList.splice(clampedIdx, 0, { ...item, entry_date: targetDate, parent_id: null });

      const updates = [];
      const stateById = new Map();

      targetList.forEach((it, idx) => {
        if (it.id === itemId) {
          // The moved item — always persist the parent_id clear too.
          stateById.set(it.id, { entry_date: targetDate, position: idx, parent_id: null });
          updates.push({ id: it.id, entry_date: targetDate, position: idx, parent_id: null });
        } else {
          stateById.set(it.id, { entry_date: targetDate, position: idx });
          updates.push({ id: it.id, entry_date: targetDate, position: idx });
        }
      });

      if (!sameDay && !wasSubtask) {
        // Source-day top-level list re-index (the moved item lived there).
        const sourceList = inDay(sourceDate).filter((it) => it.id !== itemId);
        sourceList.forEach((it, idx) => {
          stateById.set(it.id, { entry_date: sourceDate, position: idx });
          updates.push({ id: it.id, entry_date: sourceDate, position: idx });
        });
      }

      setState((prev) => ({
        ...prev,
        items: prev.items.map((it) => (stateById.has(it.id) ? { ...it, ...stateById.get(it.id) } : it)),
      }));

      await Promise.all(
        updates.map((u) => {
          const payload = { entry_date: u.entry_date, position: u.position };
          if (u.parent_id !== undefined) payload.parent_id = u.parent_id;
          return supabase
            .from('goal_plan_items')
            .update(payload)
            .eq('id', u.id)
            .eq('user_id', user.id);
        })
      );
    },
    [user?.id]
  );

  const setDayNote = useCallback(
    async (entry_date, patch) => {
      if (!user?.id || !entry_date) return;
      const cur = state.notes[entry_date] || {
        start_text: '',
        end_text: '',
        start_color: null,
        end_color: null,
      };
      const next = {
        start_text: patch.start_text != null ? patch.start_text : cur.start_text,
        end_text: patch.end_text != null ? patch.end_text : cur.end_text,
        start_color: patch.start_color !== undefined ? patch.start_color : cur.start_color,
        end_color: patch.end_color !== undefined ? patch.end_color : cur.end_color,
      };
      setState((prev) => ({
        ...prev,
        notes: { ...prev.notes, [entry_date]: next },
      }));
      await supabase
        .from('goal_plan_day_notes')
        .upsert(
          {
            user_id: user.id,
            entry_date,
            start_text: next.start_text,
            end_text: next.end_text,
            start_color: next.start_color,
            end_color: next.end_color,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,entry_date' }
        );
    },
    [user?.id, state.notes]
  );

  return {
    loading,
    itemsByKind,
    allItems: state.items,
    notes: state.notes,
    addItem,
    addItemAfter,
    updateItem,
    toggleComplete,
    deleteItem,
    reorderItems,
    moveDayItem,
    setDayNote,
    refetch: fetchAll,
  };
}
