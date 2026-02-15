-- Store collapsed state for any list: day card, no-date list, completed list per day or no-date
create table if not exists public.user_list_collapsed (
  user_id uuid not null references auth.users(id) on delete cascade,
  list_key text not null,
  collapsed boolean not null default false,
  primary key (user_id, list_key)
);

alter table public.user_list_collapsed enable row level security;

create policy "Users can manage own list collapsed"
  on public.user_list_collapsed for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
