-- «CRM»: a kanban board that works as a client base. A card is then a client,
-- with a phone and the messenger they are reached in, and instead of a task
-- list it keeps the story of every touch with them. Its reminder is the next
-- touch, and closing one is the work of the day: a touch remembers the reminder
-- it closed, and those are what the daily count adds up.

alter table public.task_projects
  add column if not exists kanban_crm boolean not null default false;

alter table public.kanban_cards
  add column if not exists phone text not null default '',
  add column if not exists messenger text
    check (messenger is null or messenger in ('telegram', 'whatsapp', 'max'));

create table if not exists public.kanban_touches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.task_projects(id) on delete cascade,
  card_id uuid not null references public.kanban_cards(id) on delete cascade,
  body text not null default '',
  touched_at timestamptz not null default now(),
  -- The day of the reminder this touch closed; null for a touch on its own.
  closed_reminder date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kanban_touches_card on public.kanban_touches(card_id, touched_at);
create index if not exists kanban_touches_board on public.kanban_touches(board_id, touched_at);

-- Access: the owner of the board plus everyone it is shared with, mirroring
-- the policies of the cards.
alter table public.kanban_touches enable row level security;

drop policy if exists "Users can manage own kanban touches" on public.kanban_touches;
create policy "Users can manage own kanban touches"
  on public.kanban_touches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members manage shared kanban touches" on public.kanban_touches;
create policy "members manage shared kanban touches"
  on public.kanban_touches for all
  using (public.is_project_member(board_id))
  with check (public.is_project_member(board_id));

drop policy if exists "owners manage kanban touches" on public.kanban_touches;
create policy "owners manage kanban touches"
  on public.kanban_touches for all
  using (public.is_project_owner(board_id))
  with check (public.is_project_owner(board_id));

alter table public.kanban_touches replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.kanban_touches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Collaboration: touches broadcast on the `project:<id>` topic of their board,
-- like everything else on it (see migration 030).
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
  elsif tg_table_name = 'kanban_touches' then
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

drop trigger if exists broadcast_kanban_touches_change on public.kanban_touches;
create trigger broadcast_kanban_touches_change
  after insert or update or delete on public.kanban_touches
  for each row execute function public.broadcast_project_change();
