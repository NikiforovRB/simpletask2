-- Calendar: timeline zoom scale (1x / 2x / 3x).
alter table public.user_settings
  add column if not exists calendar_scale int not null default 1 check (calendar_scale >= 1 and calendar_scale <= 3);
