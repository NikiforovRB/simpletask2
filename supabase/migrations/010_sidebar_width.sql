alter table public.user_settings
  add column if not exists sidebar_width_px int not null default 220
  check (sidebar_width_px >= 100 and sidebar_width_px <= 400);
