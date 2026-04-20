-- Unify projects and custom boards in a single left-menu list.
-- task_projects now has a "kind" discriminator:
--   'project' = regular list of tasks (default)
--   'board'   = free-form board with its own text blocks
alter table public.task_projects
  add column if not exists kind text not null default 'project'
  check (kind in ('project', 'board'));

-- Scope board items to a specific custom board (or keep NULL for the
-- built-in "Доска" menu item that cannot be deleted).
alter table public.board_items
  add column if not exists board_id uuid
  references public.task_projects(id) on delete cascade;

create index if not exists board_items_board on public.board_items(board_id);
