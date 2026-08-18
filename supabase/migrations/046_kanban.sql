-- Kanban boards. A board is a task_projects row with kind = 'kanban', so it
-- appears in the left menu and can be renamed, shared and deleted exactly like
-- the other user-made sections. Its columns and cards live in the two tables
-- below, while the tasks of a card are ordinary rows in `tasks` — that way a
-- card gets the whole task list (subtasks, colours, spacing, drag and drop)
-- without a second implementation of it.

alter table public.task_projects drop constraint if exists task_projects_kind_check;
alter table public.task_projects
  add constraint task_projects_kind_check check (kind in ('project', 'board', 'kanban'));

-- How the board is drawn. It belongs to the board rather than to the viewer,
-- so everyone it is shared with sees the same layout.
alter table public.task_projects
  add column if not exists kanban_column_width int not null default 280
    check (kanban_column_width between 180 and 640),
  add column if not exists kanban_show_description boolean not null default true,
  add column if not exists kanban_show_tasks boolean not null default true,
  add column if not exists kanban_show_subtasks boolean not null default false;

create table if not exists public.kanban_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.task_projects(id) on delete cascade,
  title text not null default '',
  accent_color text not null default '#5a86ee', -- the 3px strip under the title
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kanban_columns_board on public.kanban_columns(board_id, position);

create table if not exists public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.task_projects(id) on delete cascade,
  column_id uuid not null references public.kanban_columns(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  border_color text, -- null: no outline
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kanban_cards_column on public.kanban_cards(column_id, position);
create index if not exists kanban_cards_board on public.kanban_cards(board_id);

-- The tasks of a card. `card_id` alone would be enough to find them, but the
-- list type is what keeps them out of every other section, since those all
-- select by it.
alter table public.tasks drop constraint if exists tasks_list_type_check;
alter table public.tasks
  add constraint tasks_list_type_check check (list_type in ('inbox', 'someday', 'project', 'kanban'));

alter table public.tasks
  add column if not exists card_id uuid references public.kanban_cards(id) on delete cascade;

create index if not exists tasks_card on public.tasks(card_id);

-- Access: the owner of the board plus everyone it is shared with, mirroring
-- the policies of board_items.
alter table public.kanban_columns enable row level security;
alter table public.kanban_cards enable row level security;

drop policy if exists "Users can manage own kanban columns" on public.kanban_columns;
create policy "Users can manage own kanban columns"
  on public.kanban_columns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members manage shared kanban columns" on public.kanban_columns;
create policy "members manage shared kanban columns"
  on public.kanban_columns for all
  using (public.is_project_member(board_id))
  with check (public.is_project_member(board_id));

drop policy if exists "owners manage kanban columns" on public.kanban_columns;
create policy "owners manage kanban columns"
  on public.kanban_columns for all
  using (public.is_project_owner(board_id))
  with check (public.is_project_owner(board_id));

drop policy if exists "Users can manage own kanban cards" on public.kanban_cards;
create policy "Users can manage own kanban cards"
  on public.kanban_cards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members manage shared kanban cards" on public.kanban_cards;
create policy "members manage shared kanban cards"
  on public.kanban_cards for all
  using (public.is_project_member(board_id))
  with check (public.is_project_member(board_id));

drop policy if exists "owners manage kanban cards" on public.kanban_cards;
create policy "owners manage kanban cards"
  on public.kanban_cards for all
  using (public.is_project_owner(board_id))
  with check (public.is_project_owner(board_id));

alter table public.kanban_columns replica identity full;
alter table public.kanban_cards replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.kanban_columns;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.kanban_cards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Collaboration: a board is a project, so its columns and cards broadcast on
-- the same `project:<id>` topic as its tasks (see migration 030).
create or replace function public.broadcast_project_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  rec record;
  pid uuid;
begin
  if tg_op = 'DELETE' then
    rec := old;
  else
    rec := new;
  end if;

  if tg_table_name = 'tasks' then
    pid := rec.project_id;
  elsif tg_table_name = 'board_items' then
    pid := rec.board_id;
  elsif tg_table_name = 'kanban_columns' then
    pid := rec.board_id;
  elsif tg_table_name = 'kanban_cards' then
    pid := rec.board_id;
  elsif tg_table_name = 'task_projects' then
    pid := rec.id;
  elsif tg_table_name = 'project_members' then
    pid := rec.project_id;
  end if;

  if pid is not null then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'db_change',
      'project:' || pid::text,
      false  -- public topic; payload contains no row data
    );
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_kanban_columns_change on public.kanban_columns;
create trigger broadcast_kanban_columns_change
  after insert or update or delete on public.kanban_columns
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_kanban_cards_change on public.kanban_cards;
create trigger broadcast_kanban_cards_change
  after insert or update or delete on public.kanban_cards
  for each row execute function public.broadcast_project_change();
