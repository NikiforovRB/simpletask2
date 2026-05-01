import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const OFFLINE_KEY = 'board_offline_mode';

const TEXT_FONT_WEIGHTS = ['light', 'regular', 'medium', 'semibold', 'bold'];

function normalizeTextFontWeight(v) {
  const s = String(v ?? 'medium').toLowerCase();
  return TEXT_FONT_WEIGHTS.includes(s) ? s : 'medium';
}

function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeRow(user, patch, idOverride) {
  const id = idOverride || genId();
  const nowIso = new Date().toISOString();
  const kind = patch.kind ?? 'text';
  const isLine = kind === 'line_v' || kind === 'line_h';
  const minW = isLine ? 1 : 40;
  const minH = isLine ? 1 : 30;
  const defaultW = kind === 'line_v' ? 1 : kind === 'line_h' ? 100 : 200;
  const defaultH = kind === 'line_v' ? 100 : kind === 'line_h' ? 1 : 100;
  return {
    id,
    user_id: user.id,
    text: patch.text ?? '',
    x: Math.round(patch.x ?? 40),
    y: Math.round(patch.y ?? 40),
    width: Math.max(minW, Math.round(patch.width ?? defaultW)),
    height: Math.max(minH, Math.round(patch.height ?? defaultH)),
    text_color: patch.text_color ?? '#ffffff',
    has_border: !!patch.has_border,
    padding: Math.max(0, Math.round(patch.padding ?? 0)),
    text_scale: patch.text_scale ?? 1,
    text_font_weight: normalizeTextFontWeight(patch.text_font_weight),
    border_color: patch.border_color ?? '#2f2f2f',
    border_radius: Math.max(0, Math.round(patch.border_radius ?? 0)),
    kind,
    board_id: patch.board_id ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function useBoardItems() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  itemsRef.current = items;
  const pendingInsertsRef = useRef(new Map());
  const [loading, setLoading] = useState(true);

  const [offline, setOfflineState] = useState(() => {
    try {
      return localStorage.getItem(OFFLINE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  // pending ops stored in refs to avoid stale closures
  const pendingRef = useRef({
    creates: new Map(), // id -> full row
    updates: new Map(), // id -> { patch, boardId }
    deletes: new Map(), // id -> boardId
  });
  const [pendingVersion, setPendingVersion] = useState(0);
  const touchPending = useCallback(() => setPendingVersion((v) => v + 1), []);

  const hasPending =
    pendingRef.current.creates.size +
      pendingRef.current.updates.size +
      pendingRef.current.deletes.size >
    0;

  const dirtyBoardIds = useMemo(() => {
    const s = new Set();
    const p = pendingRef.current;
    p.creates.forEach((row) => s.add(row.board_id ?? null));
    p.updates.forEach(({ boardId }) => s.add(boardId ?? null));
    p.deletes.forEach((boardId) => s.add(boardId ?? null));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVersion]);

  const setOffline = useCallback((v) => {
    setOfflineState(!!v);
    try {
      localStorage.setItem(OFFLINE_KEY, v ? '1' : '0');
    } catch {
      /* noop */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('board_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (!error) {
      const p = pendingRef.current;
      // Merge server data with locally pending changes so we don't lose local state
      const pendingCreatesList = Array.from(p.creates.values());
      const serverMap = new Map((data || []).map((r) => [r.id, r]));
      // Apply pending updates on top of server rows
      p.updates.forEach(({ patch }, id) => {
        const existing = serverMap.get(id);
        if (existing) serverMap.set(id, { ...existing, ...patch });
      });
      // Remove pending deletes from view
      p.deletes.forEach((_, id) => serverMap.delete(id));
      const merged = [...serverMap.values(), ...pendingCreatesList].sort((a, b) => {
        const aT = a.created_at || '';
        const bT = b.created_at || '';
        return aT < bT ? -1 : aT > bT ? 1 : 0;
      });
      setItems(merged);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAll();
  }, [user?.id, fetchAll]);

  // Realtime: only while online
  useEffect(() => {
    if (!user?.id) return;
    if (offline) return;
    const channel = supabase
      .channel('board_items_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_items', filter: `user_id=eq.${user.id}` },
        () => {
          fetchAll();
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, offline, fetchAll]);

  const addItem = useCallback(
    async (patch = {}) => {
      if (!user?.id) return null;
      const row = normalizeRow(user, patch);
      setItems((prev) => [...prev, row]);
      if (offlineRef.current) {
        pendingRef.current.creates.set(row.id, row);
        touchPending();
        return row.id;
      }
      const insertPromise = supabase
        .from('board_items')
        .insert(row)
        .then(({ error }) => {
          if (error) {
            setItems((prev) => prev.filter((it) => it.id !== row.id));
          }
        })
        .finally(() => {
          pendingInsertsRef.current.delete(row.id);
        });
      pendingInsertsRef.current.set(row.id, insertPromise);
      await insertPromise;
      return row.id;
    },
    [user, touchPending]
  );

  const updateItemLocal = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const updateItem = useCallback(
    async (id, patch) => {
      if (!user?.id) return;
      let boardId = null;
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          boardId = it.board_id ?? null;
          return { ...it, ...patch };
        })
      );
      if (offlineRef.current) {
        const p = pendingRef.current;
        if (p.creates.has(id)) {
          p.creates.set(id, { ...p.creates.get(id), ...patch });
        } else {
          const existing = p.updates.get(id) || { patch: {}, boardId };
          p.updates.set(id, { patch: { ...existing.patch, ...patch }, boardId });
        }
        touchPending();
        return;
      }
      const pendingInsert = pendingInsertsRef.current.get(id);
      if (pendingInsert) {
        try {
          await pendingInsert;
        } catch {}
      }
      const updates = { ...patch, updated_at: new Date().toISOString() };
      await supabase.from('board_items').update(updates).eq('id', id).eq('user_id', user.id);
    },
    [user?.id, touchPending]
  );

  const cloneItems = useCallback(
    (sourceIds, { dx = 0, dy = 0 } = {}) => {
      if (!user?.id) return [];
      const currentItems = itemsRef.current;
      const srcMap = new Map(currentItems.map((it) => [it.id, it]));
      const newRows = [];
      const mapping = [];
      for (const srcId of sourceIds) {
        const src = srcMap.get(srcId);
        if (!src) continue;
        const row = normalizeRow(user, {
          text: src.text,
          x: (src.x || 0) + dx,
          y: (src.y || 0) + dy,
          width: src.width,
          height: src.height,
          text_color: src.text_color,
          has_border: src.has_border,
          padding: src.padding,
          text_scale: src.text_scale,
          text_font_weight: src.text_font_weight,
          border_color: src.border_color,
          border_radius: src.border_radius,
          kind: src.kind,
          board_id: src.board_id,
        });
        newRows.push(row);
        mapping.push({ oldId: srcId, newId: row.id, row });
      }
      if (!newRows.length) return [];
      setItems((prev) => [...prev, ...newRows]);
      if (offlineRef.current) {
        const p = pendingRef.current;
        for (const r of newRows) p.creates.set(r.id, r);
        touchPending();
      } else {
        const insertPromise = supabase
          .from('board_items')
          .insert(newRows)
          .then(({ error }) => {
            if (error) {
              const ids = new Set(newRows.map((r) => r.id));
              setItems((prev) => prev.filter((it) => !ids.has(it.id)));
            }
          })
          .finally(() => {
            for (const r of newRows) pendingInsertsRef.current.delete(r.id);
          });
        for (const r of newRows) pendingInsertsRef.current.set(r.id, insertPromise);
      }
      return mapping;
    },
    [user, touchPending]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!user?.id) return;
      let boardId = null;
      setItems((prev) => {
        const it = prev.find((x) => x.id === id);
        if (it) boardId = it.board_id ?? null;
        return prev.filter((x) => x.id !== id);
      });
      if (offlineRef.current) {
        const p = pendingRef.current;
        if (p.creates.has(id)) {
          // never sent to server — just drop pending create
          p.creates.delete(id);
        } else {
          p.updates.delete(id);
          p.deletes.set(id, boardId);
        }
        touchPending();
        return;
      }
      const pendingInsert = pendingInsertsRef.current.get(id);
      if (pendingInsert) {
        try {
          await pendingInsert;
        } catch {}
      }
      await supabase.from('board_items').delete().eq('id', id).eq('user_id', user.id);
    },
    [user?.id, touchPending]
  );

  const sync = useCallback(async () => {
    if (!user?.id) return;
    const p = pendingRef.current;
    const creates = Array.from(p.creates.values());
    const updates = Array.from(p.updates.entries());
    const deletes = Array.from(p.deletes.keys());

    if (creates.length) {
      const { error } = await supabase.from('board_items').insert(creates);
      if (error) {
        console.error('Sync: insert failed', error);
        return;
      }
    }
    for (const [id, { patch }] of updates) {
      const payload = { ...patch, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from('board_items')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) {
        console.error('Sync: update failed', error);
        return;
      }
    }
    for (const id of deletes) {
      const { error } = await supabase
        .from('board_items')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) {
        console.error('Sync: delete failed', error);
        return;
      }
    }
    pendingRef.current = { creates: new Map(), updates: new Map(), deletes: new Map() };
    touchPending();
    await fetchAll();
  }, [user?.id, fetchAll, touchPending]);

  return {
    items,
    loading,
    addItem,
    updateItem,
    updateItemLocal,
    deleteItem,
    cloneItems,
    refetch: fetchAll,
    offline,
    setOffline,
    hasPending,
    dirtyBoardIds,
    sync,
  };
}
