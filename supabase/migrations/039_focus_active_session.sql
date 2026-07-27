-- The focus timer session that is currently in progress (one per user).
-- Kept separate from focus_sessions so analytics only ever sees finished work;
-- the row is deleted once the session is stopped and logged.
create table if not exists public.focus_active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'stopwatch' check (mode in ('stopwatch', 'pomodoro')),
  phase text not null default 'work' check (phase in ('work', 'break')),
  running boolean not null default false,
  phase_base_seconds double precision not null default 0, -- elapsed in the phase before the last resume
  phase_start_at timestamptz,                             -- when the phase was last resumed (null while paused)
  work_logged_seconds double precision not null default 0,
  cycles int not null default 0,
  pomo_work int not null default 25,
  pomo_break int not null default 5,
  session_started_at timestamptz not null,
  target_ref text,
  target_title text,
  target_source text,
  last_seen_at timestamptz not null default now(),        -- heartbeat, used to detect an abandoned session
  updated_at timestamptz not null default now()
);

alter table public.focus_active_sessions enable row level security;

drop policy if exists "Users can manage own focus_active_sessions" on public.focus_active_sessions;
create policy "Users can manage own focus_active_sessions"
  on public.focus_active_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.focus_active_sessions replica identity full;
