-- Reliable realtime for collaboration via Supabase Broadcast (from the database).
-- Any change to a project's tasks / board items / the project row / its members
-- emits a lightweight broadcast on topic `project:<project_id>`. Clients
-- subscribed to that topic refetch. The payload carries NO row data (only the
-- table name + operation), so it is safe to send on a public broadcast topic;
-- the actual data stays protected by table RLS when the client refetches.

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

drop trigger if exists broadcast_tasks_change on public.tasks;
create trigger broadcast_tasks_change
  after insert or update or delete on public.tasks
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_board_items_change on public.board_items;
create trigger broadcast_board_items_change
  after insert or update or delete on public.board_items
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_task_projects_change on public.task_projects;
create trigger broadcast_task_projects_change
  after insert or update or delete on public.task_projects
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_project_members_change on public.project_members;
create trigger broadcast_project_members_change
  after insert or update or delete on public.project_members
  for each row execute function public.broadcast_project_change();
