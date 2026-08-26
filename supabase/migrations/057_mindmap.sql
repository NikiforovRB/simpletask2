-- Mind maps. A map is a task_projects row with kind = 'mindmap', so it appears
-- in the left menu and can be renamed, shared and deleted like every other
-- user-made section. Its nodes live in one self-referencing table: a node knows
-- its parent and its place among its siblings, which is all a tree needs.

alter table public.task_projects drop constraint if exists task_projects_kind_check;
alter table public.task_projects
  add constraint task_projects_kind_check check (kind in ('project', 'board', 'kanban', 'mindmap'));

-- How the map is drawn. It belongs to the map rather than to the viewer, so
-- everyone it is shared with sees the same layout.
alter table public.task_projects
  add column if not exists mind_node_width int not null default 240
    check (mind_node_width between 160 and 520),
  add column if not exists mind_show_description boolean not null default true,
  add column if not exists mind_show_count boolean not null default true;

create table if not exists public.mind_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.task_projects(id) on delete cascade,
  -- Null for the nodes the map starts from; a branch goes with its parent.
  parent_id uuid references public.mind_nodes(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  title_color text, -- null: the usual colour of text
  border_color text, -- null: no outline
  bg_color text, -- null: the usual surface, otherwise a fifth of this colour
  collapsed boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mind_nodes_board on public.mind_nodes(board_id);
create index if not exists mind_nodes_parent on public.mind_nodes(parent_id, position);

-- Access: the owner of the map plus everyone it is shared with, mirroring the
-- policies of the kanban tables.
alter table public.mind_nodes enable row level security;

drop policy if exists "Users can manage own mind nodes" on public.mind_nodes;
create policy "Users can manage own mind nodes"
  on public.mind_nodes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members manage shared mind nodes" on public.mind_nodes;
create policy "members manage shared mind nodes"
  on public.mind_nodes for all
  using (public.is_project_member(board_id))
  with check (public.is_project_member(board_id));

drop policy if exists "owners manage mind nodes" on public.mind_nodes;
create policy "owners manage mind nodes"
  on public.mind_nodes for all
  using (public.is_project_owner(board_id))
  with check (public.is_project_owner(board_id));

alter table public.mind_nodes replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.mind_nodes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Collaboration: a map is a project, so its nodes broadcast on the same
-- `project:<id>` topic as everything else (see migration 030).
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
  elsif tg_table_name = 'kanban_labels' then
    pid := rec.board_id;
  elsif tg_table_name = 'mind_nodes' then
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

drop trigger if exists broadcast_mind_nodes_change on public.mind_nodes;
create trigger broadcast_mind_nodes_change
  after insert or update or delete on public.mind_nodes
  for each row execute function public.broadcast_project_change();
