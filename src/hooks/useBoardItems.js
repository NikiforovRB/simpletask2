import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useBoardItems() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!error) setItems(data || []);
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

  useEffect(() => {
    if (!user?.id) return;
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
  }, [user?.id, fetchAll]);

  const addItem = useCallback(
    async (patch = {}) => {
      if (!user?.id) return null;
      const row = {
        user_id: user.id,
        text: patch.text ?? '',
        x: Math.round(patch.x ?? 40),
        y: Math.round(patch.y ?? 40),
        width: Math.max(40, Math.round(patch.width ?? 200)),
        height: Math.max(30, Math.round(patch.height ?? 100)),
        text_color: patch.text_color ?? '#ffffff',
        has_border: !!patch.has_border,
        padding: Math.max(0, Math.round(patch.padding ?? 10)),
        text_scale: patch.text_scale ?? 1,
        border_color: patch.border_color ?? '#2f2f2f',
        board_id: patch.board_id ?? null,
      };
      const { data, error } = await supabase.from('board_items').insert(row).select().single();
      if (error || !data) return null;
      setItems((prev) => [...prev, data]);
      return data.id;
    },
    [user?.id]
  );

  const updateItemLocal = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const updateItem = useCallback(
    async (id, patch) => {
      if (!user?.id) return;
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      const updates = { ...patch, updated_at: new Date().toISOString() };
      await supabase.from('board_items').update(updates).eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!user?.id) return;
      setItems((prev) => prev.filter((it) => it.id !== id));
      await supabase.from('board_items').delete().eq('id', id).eq('user_id', user.id);
    },
    [user?.id]
  );

  return {
    items,
    loading,
    addItem,
    updateItem,
    updateItemLocal,
    deleteItem,
    refetch: fetchAll,
  };
}
