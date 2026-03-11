-- Projects and list types for tasks
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.task_projects enable row level security;

create policy "Users can manage own projects"
  on public.task_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.tasks
  add column if not exists list_type text not null default 'inbox' check (list_type in ('inbox','someday','project')),
  add column if not exists project_id uuid references public.task_projects(id) on delete cascade;

