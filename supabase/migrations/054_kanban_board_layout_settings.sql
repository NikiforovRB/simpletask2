-- Two more things a kanban board remembers about itself: which end of a column
-- a new card joins, and whether a phone should show the columns one under
-- another at full width instead of side by side.

alter table public.task_projects
  add column if not exists kanban_new_card_position text not null default 'end',
  add column if not exists kanban_mobile_single boolean not null default false;
