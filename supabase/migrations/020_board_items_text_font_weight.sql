alter table public.board_items
  add column if not exists text_font_weight text not null default 'medium'
  check (text_font_weight in ('light', 'regular', 'medium', 'semibold', 'bold'));
