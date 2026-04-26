alter table public.board_items
  add column if not exists border_radius int not null default 0
  check (border_radius >= 0 and border_radius <= 100);
