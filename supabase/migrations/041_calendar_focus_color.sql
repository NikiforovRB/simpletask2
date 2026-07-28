-- Calendar: colour of the filled areas on the focus-session scale.
alter table public.user_settings
  add column if not exists calendar_focus_color text not null default '#15c466';
