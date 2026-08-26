-- Which way the branches of a mind map grow: to the right, as a map usually
-- reads, or downwards, the way a structure of something is drawn.

alter table public.task_projects
  add column if not exists mind_direction text not null default 'right';

alter table public.task_projects drop constraint if exists task_projects_mind_direction_check;
alter table public.task_projects
  add constraint task_projects_mind_direction_check check (mind_direction in ('right', 'down'));
