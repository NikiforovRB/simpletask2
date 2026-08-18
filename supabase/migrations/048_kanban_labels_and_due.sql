-- Labels and a due date for kanban cards.
--
-- Labels belong to the board, not to a card: the same set is offered on every
-- card and is used to filter the board from its header. A card keeps the ids of
-- its labels in an array — the alternative, a link table, would need its own
-- realtime channel and policies to say the same thing.

create table if not exists public.kanban_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.task_projects(id) on delete cascade,
  title text not null default '',
  color text not null default '#5a86ee',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kanban_labels_board on public.kanban_labels(board_id, position);

alter table public.kanban_cards
  -- The day the card is due. It is highlighted once that day has passed.
  add column if not exists due_date date,
  add column if not exists label_ids uuid[] not null default '{}';

alter table public.kanban_labels enable row level security;

drop policy if exists "Users can manage own kanban labels" on public.kanban_labels;
create policy "Users can manage own kanban labels"
  on public.kanban_labels for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members manage shared kanban labels" on public.kanban_labels;
create policy "members manage shared kanban labels"
  on public.kanban_labels for all
  using (public.is_project_member(board_id))
  with check (public.is_project_member(board_id));

drop policy if exists "owners manage kanban labels" on public.kanban_labels;
create policy "owners manage kanban labels"
  on public.kanban_labels for all
  using (public.is_project_owner(board_id))
  with check (public.is_project_owner(board_id));

alter table public.kanban_labels replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.kanban_labels;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Same project-scoped broadcast as the columns and the cards (migration 046).
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

drop trigger if exists broadcast_kanban_labels_change on public.kanban_labels;
create trigger broadcast_kanban_labels_change
  after insert or update or delete on public.kanban_labels
  for each row execute function public.broadcast_project_change();
