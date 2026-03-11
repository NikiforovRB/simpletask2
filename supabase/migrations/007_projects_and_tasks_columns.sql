-- Ensure projects and list_type/project_id exist (idempotent).
-- Run this if tasks for projects do not show or columns are missing.

-- Projects table (same as 006)
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.task_projects enable row level security;

drop policy if exists "Users can manage own projects" on public.task_projects;
create policy "Users can manage own projects"
  on public.task_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tasks: add list_type and project_id if missing
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'list_type'
  ) then
    alter table public.tasks
      add column list_type text not null default 'inbox'
      check (list_type in ('inbox','someday','project'));
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'project_id'
  ) then
    alter table public.tasks
      add column project_id uuid references public.task_projects(id) on delete cascade;
  end if;
end $$;
