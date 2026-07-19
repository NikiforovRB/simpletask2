-- Calendar/Plans sync: tasks get an optional end time.
-- A task with scheduled_time (+ scheduled_end_time) renders on the Calendar
-- timeline and with a "13:00 - 13:30 •" prefix in Plans.
alter table public.tasks
  add column if not exists scheduled_end_time time;
