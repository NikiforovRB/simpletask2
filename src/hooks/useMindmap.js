import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects } from '../lib/projectRealtime';

/**
 * The nodes of every mind map the user can reach (their own and the shared
 * ones). `boardIds` comes from the project list, so the hook does not have to
 * work out access on its own.
 *
 * A node knows its parent and its place among its siblings; the tree itself is
 * built in the view. Every mutation is applied locally first — a map is dragged
 * around a lot, and waiting for a round trip on each move would feel sticky.
 */
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

const siblingsOf = (list, boardId, parentId) => list
  .filter((n) => n.board_id === boardId && (n.parent_id ?? null) === (parentId ?? null))
  .sort(byPosition);

export function useMindmap(boardIds) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  // The nodes as they stand right now, including the ones added a moment ago:
  // typing node after node is faster than a re-render, and the next position
  // has to count the ones that are still on their way in.
  const ref = useRef([]);
  const put = useCallback((next) => {
    ref.current = next;
    setNodes(next);
  }, []);
  const patch = useCallback((fn) => {
    put(fn(ref.current));
  }, [put]);

  const idsKey = useMemo(() => (boardIds || []).slice().sort().join(','), [boardIds]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      put([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('mind_nodes')
      .select('*')
      .in('board_id', ids)
      .order('position', { ascending: true });
    put((data || []).slice().sort(byPosition));
    setLoading(false);
  }, [userId, idsKey, put]);

  useEffect(() => {
    if (!userId) {
      put([]);
      setLoading(false);
      return undefined;
    }
    fetchAll();
    const channel = supabase
      .channel(`mind_nodes_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mind_nodes', filter: `user_id=eq.${userId}` },
        fetchAll,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll, put]);

  // Changes made by a collaborator on a shared map.
  useEffect(() => {
    if (!userId || !idsKey) return undefined;
    return subscribeProjects(idsKey.split(','), fetchAll);
  }, [userId, idsKey, fetchAll]);

  /**
   * Room for one more node right after the sibling standing at `at`: places
   * are whole numbers, so the ones below it move down to leave a free one.
   */
  const openGap = useCallback(async (siblings, at) => {
    const writes = [];
    siblings.forEach((n, i) => {
      const want = i <= at ? i : i + 1;
      if ((n.position ?? 0) !== want) writes.push([n.id, want]);
    });
    if (writes.length === 0) return;
    const wanted = new Map(writes);
    patch((prev) => prev.map((n) => (wanted.has(n.id) ? { ...n, position: wanted.get(n.id) } : n)));
    const results = await Promise.all(
      writes.map(([id, position]) => supabase.from('mind_nodes').update({ position }).eq('id', id)),
    );
    if (results.some((r) => r.error)) await fetchAll();
  }, [fetchAll, patch]);

  /**
   * A new node under `parentId` (null for one of the nodes the map starts
   * from). `after` puts it right behind that sibling instead of at the end,
   * which is what pressing Enter on a node does.
   */
  const addNode = useCallback(async (boardId, parentId = null, fields = {}) => {
    if (!userId || !boardId) return null;
    const { after, atStart, ...rest } = fields;
    const siblings = siblingsOf(ref.current, boardId, parentId);
    let position;
    const at = after ? siblings.findIndex((n) => n.id === after) : -1;
    if (at >= 0) {
      await openGap(siblings, at);
      position = at + 1;
    } else if (atStart) {
      position = siblings.length ? (siblings[0].position ?? 0) - 1 : 0;
    } else {
      position = siblings.length ? Math.max(...siblings.map((n) => n.position ?? 0)) + 1 : 0;
    }
    const row = {
      user_id: userId,
      board_id: boardId,
      parent_id: parentId ?? null,
      title: '',
      description: '',
      ...rest,
      position,
    };
    const { data, error } = await supabase.from('mind_nodes').insert(row).select().single();
    if (error || !data) {
      await fetchAll();
      return null;
    }
    patch((prev) => [...prev, data].sort(byPosition));
    // A branch nobody can see is confusing: opening the parent shows where the
    // new node went.
    if (parentId) {
      const parent = ref.current.find((n) => n.id === parentId);
      if (parent?.collapsed) {
        patch((prev) => prev.map((n) => (n.id === parentId ? { ...n, collapsed: false } : n)));
        await supabase.from('mind_nodes').update({ collapsed: false }).eq('id', parentId);
      }
    }
    return data;
  }, [userId, fetchAll, openGap, patch]);

  const updateNode = useCallback(async (id, fields) => {
    patch((prev) => prev.map((n) => (n.id === id ? { ...n, ...fields } : n)));
    const { error } = await supabase
      .from('mind_nodes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) await fetchAll();
  }, [fetchAll, patch]);

  /** The same change to a whole set of nodes — folding or opening a branch. */
  const updateNodes = useCallback(async (ids, fields) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    patch((prev) => prev.map((n) => (set.has(n.id) ? { ...n, ...fields } : n)));
    const { error } = await supabase
      .from('mind_nodes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) await fetchAll();
  }, [fetchAll, patch]);

  /** The node and everything under it. */
  const deleteNode = useCallback(async (id) => {
    const doomed = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      ref.current.forEach((n) => {
        if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) {
          doomed.add(n.id);
          added = true;
        }
      });
    }
    patch((prev) => prev.filter((n) => !doomed.has(n.id)));
    // The cascade would take the children anyway; naming them keeps the local
    // list and the table in step even if the tree was deeper than one fetch.
    const { error } = await supabase.from('mind_nodes').delete().in('id', Array.from(doomed));
    if (error) await fetchAll();
  }, [fetchAll, patch]);

  /**
   * Put `id` at `index` among the children of `parentId`, renumbering the
   * branch it left and the one it joined so their positions stay 0..n.
   */
  const moveNode = useCallback(async (id, parentId, index) => {
    const all = ref.current;
    const moved = all.find((n) => n.id === id);
    if (!moved) return;
    const from = moved.parent_id ?? null;
    const to = parentId ?? null;
    const target = all
      .filter((n) => n.board_id === moved.board_id && (n.parent_id ?? null) === to && n.id !== id)
      .sort(byPosition)
      .map((n) => n.id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, id);

    const writes = new Map();
    target.forEach((nid, i) => {
      const fields = { position: i };
      if (nid === id) fields.parent_id = to;
      writes.set(nid, fields);
    });
    if (from !== to) {
      all
        .filter((n) => n.board_id === moved.board_id && (n.parent_id ?? null) === from && n.id !== id)
        .sort(byPosition)
        .forEach((n, i) => writes.set(n.id, { position: i }));
    }

    patch((prev) => prev.map((n) => (writes.has(n.id) ? { ...n, ...writes.get(n.id) } : n)).sort(byPosition));
    const results = await Promise.all(
      Array.from(writes.entries()).map(([nid, fields]) => supabase.from('mind_nodes').update(fields).eq('id', nid)),
    );
    if (results.some((r) => r.error)) await fetchAll();
  }, [fetchAll, patch]);

  /** A copy of the node with everything under it, next to the original. */
  const duplicateNode = useCallback(async (id) => {
    if (!userId) return null;
    const source = ref.current.find((n) => n.id === id);
    if (!source) return null;
    const childrenOf = (pid) => ref.current
      .filter((n) => (n.parent_id ?? null) === pid)
      .sort(byPosition);

    const copyInto = async (node, parentId, fields) => {
      const row = {
        user_id: userId,
        board_id: node.board_id,
        parent_id: parentId,
        title: node.title,
        description: node.description,
        title_color: node.title_color,
        border_color: node.border_color,
        bg_color: node.bg_color,
        kids_layout: node.kids_layout,
        collapsed: node.collapsed,
        position: node.position,
        ...fields,
      };
      const { data } = await supabase.from('mind_nodes').insert(row).select().single();
      if (!data) return null;
      // One after another: a child is copied under the copy of its parent, so
      // each round needs the id the round before it produced.
      for (const kid of childrenOf(node.id)) {
        await copyInto(kid, data.id, {});
      }
      return data;
    };

    // The copy stands right below the original, so the branch it belongs to
    // makes room for it first.
    const siblings = siblingsOf(ref.current, source.board_id, source.parent_id ?? null);
    const at = siblings.findIndex((n) => n.id === id);
    if (at >= 0) await openGap(siblings, at);
    const copy = await copyInto(source, source.parent_id ?? null, { position: at >= 0 ? at + 1 : source.position });
    await fetchAll();
    return copy;
  }, [userId, fetchAll, openGap]);

  return {
    nodes,
    loading,
    addNode,
    updateNode,
    updateNodes,
    deleteNode,
    moveNode,
    duplicateNode,
    refetch: fetchAll,
  };
}
