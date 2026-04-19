alter table public.user_settings
  add column if not exists habits_sidebar_width_px int not null default 220
  check (habits_sidebar_width_px >= 100 and habits_sidebar_width_px <= 400);
