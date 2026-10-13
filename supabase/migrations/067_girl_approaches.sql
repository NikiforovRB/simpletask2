-- «Девушки» → «Подходы»: every approach and how it ended. A contact is linked
-- to the acquaintance created from it; deleting her keeps the approach (and the
-- conversion stats), just without the link.
create table if not exists public.girl_approaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  happened_on date not null default current_date,
  time text check (time is null or time ~ '^\d{2}:\d{2}$'),
  outcome text not null check (outcome in ('refusal', 'contact')),
  girl_id uuid references public.girls(id) on delete set null,
  place text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists girl_approaches_user_idx on public.girl_approaches (user_id, happened_on);
create index if not exists girl_approaches_girl_idx on public.girl_approaches (girl_id);

alter table public.girl_approaches enable row level security;

drop policy if exists "Chosen users manage own approaches" on public.girl_approaches;
create policy "Chosen users manage own approaches"
  on public.girl_approaches for all
  using (auth.uid() = user_id and public.is_chosen_user())
  with check (auth.uid() = user_id and public.is_chosen_user());

alter table public.girl_approaches replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.girl_approaches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
