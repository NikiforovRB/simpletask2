-- A reminder on a kanban card: a day, and a time if it matters. It is shown at
-- the bottom of the card and at the end of that day's column; with a time, the
-- app also sends a notification when it comes.
alter table public.kanban_cards
  add column if not exists remind_date date,
  add column if not exists remind_time time;
