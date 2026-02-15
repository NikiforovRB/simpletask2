-- User settings: days count (1-7)
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  days_count int not null default 3 check (days_count >= 1 and days_count <= 7),
  unique(user_id)
);

-- Tasks: top-level and subtasks (parent_id null = top-level)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  scheduled_date date,
  completed_at timestamptz,
  position int not null default 0,
  text_color text not null default '#e0e0e0'
);

create index tasks_user_date on public.tasks(user_id, scheduled_date);
create index tasks_user_parent on public.tasks(user_id, parent_id);
create index tasks_user_completed on public.tasks(user_id, completed_at);

alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

create policy "Users can manage own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
