-- The tasks without a date, listed under the day when the calendar shows a
-- single day, so a free slot of the timeline can be filled from them without
-- leaving it. Shown unless switched off in the settings.

alter table public.user_settings
  add column if not exists calendar_show_no_date boolean not null default true;
