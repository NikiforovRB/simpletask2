-- Menu: the order of the built-in sections, as arranged in «Порядок пунктов меню».
-- Empty means the default order.
alter table public.user_settings
  add column if not exists menu_builtin_order jsonb not null default '[]'::jsonb;

-- «Избранные»: the users who get the «Девушки» section. Kept by email, so
-- access can be granted before the person signs up. Only the superadmin
-- (from /superadmin) can add or remove anyone; a user can only see their own row.
create table if not exists public.chosen_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.chosen_users enable row level security;

drop policy if exists "chosen_users read own or superadmin" on public.chosen_users;
create policy "chosen_users read own or superadmin"
  on public.chosen_users for select
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_superadmin());

drop policy if exists "chosen_users superadmin insert" on public.chosen_users;
create policy "chosen_users superadmin insert"
  on public.chosen_users for insert
  with check (public.is_superadmin());

drop policy if exists "chosen_users superadmin delete" on public.chosen_users;
create policy "chosen_users superadmin delete"
  on public.chosen_users for delete
  using (public.is_superadmin());

create or replace function public.is_chosen_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chosen_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

insert into public.chosen_users (email)
values ('rodionnrb@gmail.com'), ('lesnikov0407@gmail.com')
on conflict (email) do nothing;

-- «Девушки»: acquaintances. Someone with at least one date (planned or past)
-- is listed under «Свидания», the rest under «Знакомства».
-- dates: [{ id, date: 'YYYY-MM-DD', time: 'HH:MM' | null, note }]
create table if not exists public.girls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  met_on date not null default current_date,
  phone text not null default '',
  telegram text not null default '',
  place text not null default '',
  comment text not null default '',
  dates jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists girls_user_idx on public.girls (user_id);

alter table public.girls enable row level security;

drop policy if exists "Chosen users manage own girls" on public.girls;
create policy "Chosen users manage own girls"
  on public.girls for all
  using (auth.uid() = user_id and public.is_chosen_user())
  with check (auth.uid() = user_id and public.is_chosen_user());

alter table public.girls replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.girls;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
