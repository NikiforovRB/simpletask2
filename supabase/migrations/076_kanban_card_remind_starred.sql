-- A reminder put into favourites: marked with a star and kept at the top of
-- the reminders of its day.

alter table public.kanban_cards
  add column if not exists remind_starred boolean not null default false;
