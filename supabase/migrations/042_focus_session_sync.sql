-- Identify each run of the focus timer so a device that has been offline can
-- tell "my session" from one that was already finished elsewhere: stopping
-- deletes the row only when the id still matches, and a device that finds no
-- row left knows the session was logged by someone else.
alter table public.focus_active_sessions
  add column if not exists session_id uuid not null default gen_random_uuid();

-- Push active-session changes to every open device (start / pause / stop).
do $$
begin
  alter publication supabase_realtime add table public.focus_active_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Minimized focus timer: show the running session, or today's total instead.
alter table public.user_settings
  add column if not exists focus_timer_show_total boolean not null default false;
