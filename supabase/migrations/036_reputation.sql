-- "Репутация перед собой" — daily self-promises with plan/fact tracking.
-- kind: 'yesno' (done flag), 'time' (plan/fact minutes), 'count' (plan/fact count).
create table if not exists public.reputation_promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  promise_date date not null,
  title text not null default '',
  kind text not null default 'yesno' check (kind in ('yesno', 'time', 'count')),
  plan_value int,   -- minutes (time) or target count (count); null for yesno
  fact_value int,   -- minutes (time) or actual count (count); null until recorded
  done boolean not null default false, -- yesno completion flag
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists reputation_promises_user_date
  on public.reputation_promises(user_id, promise_date);

alter table public.reputation_promises enable row level security;

drop policy if exists "Users can manage own reputation_promises" on public.reputation_promises;
create policy "Users can manage own reputation_promises"
  on public.reputation_promises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.reputation_promises replica identity full;
