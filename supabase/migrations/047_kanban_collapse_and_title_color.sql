-- A column can be folded away to a narrow strip when its cards are not
-- interesting right now. The state sits on the column rather than on the
-- viewer, like the rest of the board layout, so a shared board looks the same
-- to everyone.
alter table public.kanban_columns
  add column if not exists collapsed boolean not null default false;

-- The colour of the card title, picked from the same 13 colours as the tasks.
-- Null means the default text colour.
alter table public.kanban_cards
  add column if not exists title_color text;
