-- The tasks without a date that are done on the day the calendar shows can be
-- listed among that day's completed tasks instead of under the no-date list.
-- Off unless switched on in the settings.

alter table public.user_settings
  add column if not exists calendar_no_date_in_completed boolean not null default false;
