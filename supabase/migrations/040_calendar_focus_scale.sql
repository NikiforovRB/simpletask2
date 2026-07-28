-- Calendar: show a vertical focus-session scale next to the timeline.
alter table public.user_settings
  add column if not exists calendar_focus_scale boolean not null default false;
