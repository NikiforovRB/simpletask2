-- Calendar: optional checkboxes on timeline events.
alter table public.user_settings
  add column if not exists calendar_show_checkboxes boolean not null default false;
