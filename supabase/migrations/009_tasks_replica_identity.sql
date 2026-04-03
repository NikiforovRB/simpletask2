-- Realtime DELETE filters need old row columns (e.g. user_id). Default replica identity
-- only sends the primary key, so postgres_changes with filter never matched DELETEs.
alter table public.tasks replica identity full;
