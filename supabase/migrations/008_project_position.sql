-- Order of projects in the menu
alter table public.task_projects
  add column if not exists position int not null default 0;
