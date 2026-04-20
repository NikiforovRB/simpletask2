-- Extra settings for board text blocks: text scale and border color
alter table public.board_items
  add column if not exists text_scale real not null default 1
  check (text_scale >= 0.4 and text_scale <= 3);

alter table public.board_items
  add column if not exists border_color text not null default '#2f2f2f';
