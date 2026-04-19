-- Habits and daily entries (payload mirrors client: yes_no, num, time)
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('yes_no', 'not_more', 'not_less', 'not_later')),
  limit_number double precision,
  limit_time text,
  skip_mode text not null default 'none' check (skip_mode in ('none', 'every_other', 'every_third')),
  streak_enabled boolean not null default true,
  anchor_date date not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists habits_user_position on public.habits(user_id, position);

alter table public.habits enable row level security;

drop policy if exists "Users can manage own habits" on public.habits;
create policy "Users can manage own habits"
  on public.habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.habit_entries (
  habit_id uuid not null references public.habits(id) on delete cascade,
  entry_date date not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (habit_id, entry_date)
);

create index if not exists habit_entries_habit on public.habit_entries(habit_id);

alter table public.habit_entries enable row level security;

drop policy if exists "Users can manage own habit entries" on public.habit_entries;
create policy "Users can manage own habit entries"
  on public.habit_entries for all
  using (
    exists (
      select 1 from public.habits h
      where h.id = habit_entries.habit_id and h.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.habits h
      where h.id = habit_entries.habit_id and h.user_id = auth.uid()
    )
  );

alter table public.habits replica identity full;
alter table public.habit_entries replica identity full;

-- Включите Realtime для таблиц habits и habit_entries в Supabase: Project → Database → Publications → supabase_realtime
