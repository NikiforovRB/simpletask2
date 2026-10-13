import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function genGirlId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SAVE_ERROR = 'Не удалось сохранить. Проверьте подключение и попробуйте ещё раз.';
const AVATAR_BUCKET = 'girl-avatars';
const SIGNED_TTL = 3600;

function normalizeRow(row) {
  return { ...row, dates: Array.isArray(row.dates) ? row.dates : [], avatar_path: row.avatar_path || '' };
}

// Signed links to the private avatar photos, shared by every component.
const avatarUrls = new Map();

function removeAvatarFile(path) {
  if (!path) return;
  supabase.storage.from(AVATAR_BUCKET).remove([path]).then(({ error }) => {
    if (error) console.error('avatar remove error', error);
  });
}

/** Returns `urlOf(path)`; links for the given paths are fetched in one batch. */
export function useAvatarUrls(paths) {
  const key = [...new Set(paths.filter(Boolean))].sort().join('|');
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    const soon = Date.now() + 60_000;
    const missing = key.split('|').filter((p) => !(avatarUrls.get(p)?.expires > soon));
    if (!missing.length) return undefined;
    let cancelled = false;
    supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(missing, SIGNED_TTL)
      .then(({ data, error }) => {
        if (error) {
          console.error('avatar urls error', error);
          return;
        }
        const expires = Date.now() + SIGNED_TTL * 1000;
        for (const item of data || []) {
          if (item.signedUrl && item.path) avatarUrls.set(item.path, { url: item.signedUrl, expires });
        }
        if (!cancelled) setVersion((v) => v + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (path) => (path ? avatarUrls.get(path)?.url ?? null : null);
}

/** The «Девушки» list of the signed-in user (only for the chosen ones). */
export function useGirls() {
  const { user, isChosen } = useAuth();
  const userId = isChosen ? user?.id ?? null : null;
  const [rows, setRows] = useState({});
  const [loadedFor, setLoadedFor] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    supabase
      .from('girls')
      .select('*')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error('girls load error', err);
          setError('Не удалось загрузить список.');
          return;
        }
        const next = {};
        for (const row of data || []) next[row.id] = normalizeRow(row);
        setRows(next);
        setLoadedFor(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const put = (payload) => {
      const row = payload.new;
      if (row?.id) setRows((prev) => ({ ...prev, [row.id]: normalizeRow(row) }));
    };
    const channel = supabase
      .channel(`girls_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'girls', filter: `user_id=eq.${userId}` }, put)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'girls', filter: `user_id=eq.${userId}` }, put)
      // Deletes can't be filtered by user; an id that isn't ours is simply not in the map.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'girls' }, (payload) => {
        const id = payload.old?.id;
        if (!id) return;
        setRows((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const girls = useMemo(
    () => (userId ? Object.values(rows).filter((r) => r.user_id === userId) : []),
    [rows, userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase.from('girls').select('*').eq('user_id', userId);
    if (err) return;
    const next = {};
    for (const row of data || []) next[row.id] = normalizeRow(row);
    setRows(next);
  }, [userId]);

  const addGirl = useCallback(async (fields) => {
    if (!userId) return null;
    const now = new Date().toISOString();
    const row = { ...fields, id: genGirlId(), user_id: userId, archived: false, created_at: now, updated_at: now };
    setError(null);
    setRows((prev) => ({ ...prev, [row.id]: row }));
    const { data, error: err } = await supabase.from('girls').insert(row).select().single();
    if (err) {
      console.error('girls insert error', err);
      setError(SAVE_ERROR);
      setRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return null;
    }
    if (data) setRows((prev) => ({ ...prev, [data.id]: normalizeRow(data) }));
    return row.id;
  }, [userId]);

  const updateGirl = useCallback(async (id, patch) => {
    if (!userId) return;
    const updates = { ...patch, updated_at: new Date().toISOString() };
    setError(null);
    setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
    const { error: err } = await supabase.from('girls').update(updates).eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('girls update error', err);
      setError(SAVE_ERROR);
      reload();
    }
  }, [userId, reload]);

  const deleteGirl = useCallback(async (id, avatarPath) => {
    if (!userId) return;
    setError(null);
    setRows((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const { error: err } = await supabase.from('girls').delete().eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('girls delete error', err);
      setError(SAVE_ERROR);
      reload();
      return;
    }
    removeAvatarFile(avatarPath);
  }, [userId, reload]);

  /** Uploads a new photo (a ready JPEG blob) and drops the previous one. */
  const setAvatar = useCallback(async (id, blob, oldPath) => {
    if (!userId) return;
    const path = `${userId}/${id}-${Date.now().toString(36)}.jpg`;
    const { error: err } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (err) {
      console.error('avatar upload error', err);
      setError('Не удалось загрузить фото.');
      return;
    }
    avatarUrls.set(path, { url: URL.createObjectURL(blob), expires: Infinity });
    await updateGirl(id, { avatar_path: path });
    removeAvatarFile(oldPath);
  }, [userId, updateGirl]);

  const clearAvatar = useCallback(async (id, oldPath) => {
    await updateGirl(id, { avatar_path: '' });
    removeAvatarFile(oldPath);
  }, [updateGirl]);

  return {
    girls,
    loaded: !!userId && loadedFor === userId,
    error,
    dismissError: () => setError(null),
    addGirl,
    updateGirl,
    deleteGirl,
    setAvatar,
    clearAvatar,
  };
}
