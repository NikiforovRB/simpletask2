-- «Девушки» → «Планер»: when to text or call her. Dates (the other kind of
-- task) stay in girls.dates. A done task keeps its row (done_at) and makes up
-- the history of contacts with her.
create table if not exists public.girl_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  girl_id uuid not null references public.girls(id) on delete cascade,
  kind text not null check (kind in ('message', 'call')),
  due_on date not null,
  time text check (time is null or time ~ '^\d{2}:\d{2}$'),
  note text not null default '',
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists girl_tasks_user_idx on public.girl_tasks (user_id, due_on);
create index if not exists girl_tasks_girl_idx on public.girl_tasks (girl_id);

alter table public.girl_tasks enable row level security;

drop policy if exists "Chosen users manage own girl tasks" on public.girl_tasks;
create policy "Chosen users manage own girl tasks"
  on public.girl_tasks for all
  using (auth.uid() = user_id and public.is_chosen_user())
  with check (auth.uid() = user_id and public.is_chosen_user());

alter table public.girl_tasks replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.girl_tasks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
