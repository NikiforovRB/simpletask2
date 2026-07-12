import { supabase } from './supabase';

// One shared broadcast channel per project, reference-counted across all hooks
// (useTasks, useBoardItems, useProjects). The database emits a `db_change`
// broadcast on topic `project:<id>` whenever that project's tasks, board items,
// project row, or members change (see migration 030). Subscribers just refetch.

const entries = new Map(); // projectId -> { channel, handlers:Set<fn> }

function subscribeOne(projectId, handler) {
  if (!projectId || typeof handler !== 'function') return () => {};
  let entry = entries.get(projectId);
  if (!entry) {
    const channel = supabase.channel(`project:${projectId}`);
    entry = { channel, handlers: new Set() };
    channel.on('broadcast', { event: 'db_change' }, () => {
      entry.handlers.forEach((h) => {
        try {
          h();
        } catch {
          /* noop */
        }
      });
    });
    channel.subscribe();
    entries.set(projectId, entry);
  }
  entry.handlers.add(handler);

  return () => {
    const e = entries.get(projectId);
    if (!e) return;
    e.handlers.delete(handler);
    if (e.handlers.size === 0) {
      supabase.removeChannel(e.channel);
      entries.delete(projectId);
    }
  };
}

/**
 * Subscribe a single handler to broadcast changes for a list of project ids.
 * Returns an unsubscribe function that tears down all of them.
 */
export function subscribeProjects(projectIds, handler) {
  const unsubs = (projectIds || []).map((id) => subscribeOne(id, handler));
  return () => unsubs.forEach((u) => u());
}
