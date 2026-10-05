-- «Еда»: the meals of a day. A meal has a time and a comment; calories are optional.
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_date date not null,
  meal_time time not null,
  comment text not null check (length(btrim(comment)) > 0),
  calories int check (calories is null or (calories >= 0 and calories <= 99999)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meals_user_date_idx on public.meals (user_id, meal_date);

alter table public.meals enable row level security;

drop policy if exists "Users can manage own meals" on public.meals;
create policy "Users can manage own meals"
  on public.meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.meals replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.meals;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
