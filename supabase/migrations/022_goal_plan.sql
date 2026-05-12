-- Раздел «Планы с целями»:
--   * goal_plan_items — единый список со всеми пунктами разных секций:
--       kind = 'goal'   — Мои цели
--       kind = 'morning'— Утро (каждое утро)
--       kind = 'evening'— Вечер (каждый вечер)
--       kind = 'action' — Задачи для достижения цели (поддерживает подзадачи через parent_id)
--       kind = 'day'    — Задачи конкретного дня (entry_date != null)
--   * goal_plan_day_notes — фиксированный текст в начале и в конце дня.

create table if not exists public.goal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'morning', 'evening', 'action', 'day')),
  parent_id uuid references public.goal_plan_items(id) on delete cascade,
  text text not null default '',
  completed_at timestamptz,
  position int not null default 0,
  entry_date date,
  goal_id uuid references public.goal_plan_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists goal_plan_items_user_kind_pos
  on public.goal_plan_items(user_id, kind, position);
create index if not exists goal_plan_items_user_kind_date
  on public.goal_plan_items(user_id, kind, entry_date);
create index if not exists goal_plan_items_user_parent
  on public.goal_plan_items(user_id, parent_id);

alter table public.goal_plan_items enable row level security;

drop policy if exists "Users can manage own goal_plan_items" on public.goal_plan_items;
create policy "Users can manage own goal_plan_items"
  on public.goal_plan_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.goal_plan_day_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  start_text text not null default '',
  end_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.goal_plan_day_notes enable row level security;

drop policy if exists "Users can manage own goal_plan_day_notes" on public.goal_plan_day_notes;
create policy "Users can manage own goal_plan_day_notes"
  on public.goal_plan_day_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.goal_plan_items replica identity full;
alter table public.goal_plan_day_notes replica identity full;

-- В Supabase Dashboard включите Realtime для таблиц goal_plan_items и goal_plan_day_notes.
