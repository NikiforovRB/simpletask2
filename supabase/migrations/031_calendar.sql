-- Calendar mode: timeline events + per-user timeline hours.

-- Timeline start/end hour (0..24) for the calendar view.
alter table public.user_settings
  add column if not exists calendar_start_hour int not null default 8 check (calendar_start_hour >= 0 and calendar_start_hour <= 23),
  add column if not exists calendar_end_hour int not null default 22 check (calendar_end_hour >= 1 and calendar_end_hour <= 24);

-- Calendar events. Timed events use start_minute/end_minute (minutes from
-- midnight); all-day (unbound) events sit above the timeline for that day.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  event_date date not null,
  all_day boolean not null default false,
  start_minute int,
  end_minute int,
  color text not null default '#5a86ee',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_user_date on public.calendar_events(user_id, event_date);

alter table public.calendar_events enable row level security;

drop policy if exists "Users can manage own calendar_events" on public.calendar_events;
create policy "Users can manage own calendar_events"
  on public.calendar_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.calendar_events replica identity full;
