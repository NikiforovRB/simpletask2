-- Calendar: allow marking events as completed (checkbox on no-time items).
alter table public.calendar_events
  add column if not exists completed boolean not null default false;
