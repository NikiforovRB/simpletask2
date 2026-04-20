-- Board items (section "Доска")
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  x int not null default 0,
  y int not null default 0,
  width int not null default 200,
  height int not null default 100,
  text_color text not null default '#ffffff',
  has_border boolean not null default false,
  padding int not null default 10,
  z_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_items_user on public.board_items(user_id);

alter table public.board_items enable row level security;

drop policy if exists "Users can manage own board items" on public.board_items;
create policy "Users can manage own board items"
  on public.board_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.board_items replica identity full;

-- Board preferences in user_settings
alter table public.user_settings
  add column if not exists board_zoom int not null default 100
  check (board_zoom >= 25 and board_zoom <= 200);

alter table public.user_settings
  add column if not exists board_dots boolean not null default false;

-- Включите Realtime для таблицы board_items: Project → Database → Publications → supabase_realtime
