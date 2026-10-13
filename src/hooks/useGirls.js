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

const APPROACHES = 'girl_approaches';

function normalizeApproach(row) {
  return { ...row, time: row.time || null, girl_id: row.girl_id || null, place: row.place || '', note: row.note || '' };
}

const byId = (rows, normalize) => {
  const next = {};
  for (const row of rows || []) next[row.id] = normalize(row);
  return next;
};

/** Upserts / removes rows of a map kept in state from realtime events. */
function subscribeRows(name, table, userId, normalize, setRows) {
  const put = (payload) => {
    const row = payload.new;
    if (row?.id) setRows((prev) => ({ ...prev, [row.id]: normalize(row) }));
  };
  return supabase
    .channel(`${name}_${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `user_id=eq.${userId}` }, put)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `user_id=eq.${userId}` }, put)
    // Deletes can't be filtered by user; an id that isn't ours is simply not in the map.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
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
  const [approachRows, setApproachRows] = useState({});
  // { userId, ok } — ok is false while the table is missing (migration 067 not applied).
  const [approachesState, setApproachesState] = useState(null);
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
        setRows(byId(data, normalizeRow));
        setLoadedFor(userId);
      });
    supabase
      .from(APPROACHES)
      .select('*')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) console.error('approaches load error', err);
        setApproachRows(err ? {} : byId(data, normalizeApproach));
        setApproachesState({ userId, ok: !err });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const girlsChannel = subscribeRows('girls', 'girls', userId, normalizeRow, setRows);
    const approachesChannel = subscribeRows('girl_approaches', APPROACHES, userId, normalizeApproach, setApproachRows);
    return () => {
      supabase.removeChannel(girlsChannel);
      supabase.removeChannel(approachesChannel);
    };
  }, [userId]);

  const girls = useMemo(
    () => (userId ? Object.values(rows).filter((r) => r.user_id === userId) : []),
    [rows, userId],
  );

  const approaches = useMemo(
    () => (userId ? Object.values(approachRows).filter((r) => r.user_id === userId) : []),
    [approachRows, userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase.from('girls').select('*').eq('user_id', userId);
    if (err) return;
    setRows(byId(data, normalizeRow));
  }, [userId]);

  const reloadApproaches = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase.from(APPROACHES).select('*').eq('user_id', userId);
    if (err) return;
    setApproachRows(byId(data, normalizeApproach));
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

  const addApproach = useCallback(async (fields) => {
    if (!userId) return null;
    const now = new Date().toISOString();
    const row = normalizeApproach({ ...fields, id: genGirlId(), user_id: userId, created_at: now, updated_at: now });
    setError(null);
    setApproachRows((prev) => ({ ...prev, [row.id]: row }));
    const { data, error: err } = await supabase.from(APPROACHES).insert(row).select().single();
    if (err) {
      console.error('approach insert error', err);
      setError(SAVE_ERROR);
      setApproachRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return null;
    }
    if (data) setApproachRows((prev) => ({ ...prev, [data.id]: normalizeApproach(data) }));
    return row.id;
  }, [userId]);

  const updateApproach = useCallback(async (id, patch) => {
    if (!userId) return;
    const updates = { ...patch, updated_at: new Date().toISOString() };
    setError(null);
    setApproachRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
    const { error: err } = await supabase.from(APPROACHES).update(updates).eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('approach update error', err);
      setError(SAVE_ERROR);
      reloadApproaches();
    }
  }, [userId, reloadApproaches]);

  const deleteApproach = useCallback(async (id) => {
    if (!userId) return;
    setError(null);
    setApproachRows((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const { error: err } = await supabase.from(APPROACHES).delete().eq('id', id).eq('user_id', userId);
    if (err) {
      console.error('approach delete error', err);
      setError(SAVE_ERROR);
      reloadApproaches();
    }
  }, [userId, reloadApproaches]);

  return {
    girls,
    loaded: !!userId && loadedFor === userId,
    approaches,
    approachesLoaded: !!userId && approachesState?.userId === userId,
    approachesReady: !!userId && approachesState?.userId === userId && approachesState.ok,
    error,
    dismissError: () => setError(null),
    addGirl,
    updateGirl,
    deleteGirl,
    setAvatar,
    clearAvatar,
    addApproach,
    updateApproach,
    deleteApproach,
  };
}
