-- Feature: task time-of-day + local reminders, and focus/Pomodoro sessions.

-- 1. Time-of-day and reminder offset for tasks. `scheduled_time` is a local
--    wall-clock time (no timezone) paired with the existing `scheduled_date`.
--    `reminder_minutes` is how many minutes BEFORE the time to notify:
--    null = no reminder, 0 = at the exact time, otherwise 5/10/30/60.
alter table public.tasks
  add column if not exists scheduled_time time,
  add column if not exists reminder_minutes int;

-- Same for goal-plan day items (they already carry an entry_date).
alter table public.goal_plan_items
  add column if not exists scheduled_time time,
  add column if not exists reminder_minutes int;

-- 2. Focus / Pomodoro sessions. A session can target a task (from any list or
--    project) or a goal-plan item, or be a free-standing focus block. We store
--    a denormalized title + a string id (no FK, since it may point at either
--    table) so analytics survive the source row being deleted.
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_ref text,
  task_title text not null default '',
  source text not null default 'custom' check (source in ('task', 'goal_plan', 'custom')),
  mode text not null default 'stopwatch' check (mode in ('pomodoro', 'stopwatch')),
  duration_seconds int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_started
  on public.focus_sessions(user_id, started_at);

alter table public.focus_sessions enable row level security;

drop policy if exists "Users can manage own focus_sessions" on public.focus_sessions;
create policy "Users can manage own focus_sessions"
  on public.focus_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.focus_sessions replica identity full;
