-- Per-day timeline window for the calendar view.
-- A row exists only for days that deviate from the 07:00–20:00 default.
create table if not exists public.calendar_day_hours (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_date date not null,
  start_hour int not null default 7 check (start_hour >= 0 and start_hour <= 23),
  end_hour int not null default 20 check (end_hour >= 1 and end_hour <= 24),
  updated_at timestamptz not null default now(),
  primary key (user_id, day_date),
  constraint calendar_day_hours_range check (end_hour > start_hour)
);

alter table public.calendar_day_hours enable row level security;

drop policy if exists "Users can manage own calendar_day_hours" on public.calendar_day_hours;
create policy "Users can manage own calendar_day_hours"
  on public.calendar_day_hours for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.calendar_day_hours replica identity full;

-- Calendar: render the timeline as a second column on wide screens.
alter table public.user_settings
  add column if not exists calendar_two_columns boolean not null default false;
