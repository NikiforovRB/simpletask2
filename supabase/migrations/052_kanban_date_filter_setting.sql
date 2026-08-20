-- The date filter of a kanban board, one entry per board: `{"<board id>":
-- "days7"}`. It is a way of looking at a board rather than a property of it,
-- so it belongs to the person looking and not to the board — a shared board is
-- not rearranged for everyone else — but it does follow that person from one
-- device to the next, which the browser alone could not do.

alter table public.user_settings
  add column if not exists kanban_date_filters jsonb not null default '{}'::jsonb;
