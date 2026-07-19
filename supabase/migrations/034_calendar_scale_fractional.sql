-- Calendar: allow fractional timeline scale (1x, 1.2x, ... 3x).
alter table public.user_settings
  drop constraint if exists user_settings_calendar_scale_check;

alter table public.user_settings
  alter column calendar_scale type numeric(3,1) using round(calendar_scale::numeric, 1);

alter table public.user_settings
  alter column calendar_scale set default 1;

alter table public.user_settings
  add constraint user_settings_calendar_scale_check
  check (calendar_scale >= 1 and calendar_scale <= 3);
