-- Board item kinds: text block, vertical line, horizontal line
alter table public.board_items
  add column if not exists kind text not null default 'text'
  check (kind in ('text', 'line_v', 'line_h'));

-- Allow lines to be 1px thick. Drop the previous min-size constraints if they
-- were defined on width/height (this app does not enforce them in SQL, but be
-- safe in case a constraint exists with this name).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'board_items_width_min'
  ) then
    alter table public.board_items drop constraint board_items_width_min;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'board_items_height_min'
  ) then
    alter table public.board_items drop constraint board_items_height_min;
  end if;
end $$;
