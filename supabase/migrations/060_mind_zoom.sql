-- How far the mind maps are zoomed out. It belongs to the viewer rather than to
-- a map — the same map can be read close up on one screen and from afar on
-- another — so it lives beside the zoom of the boards.

alter table public.user_settings
  add column if not exists mind_zoom int not null default 100
  check (mind_zoom >= 30 and mind_zoom <= 200);
