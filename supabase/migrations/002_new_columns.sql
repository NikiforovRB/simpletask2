-- user_settings: where to add new tasks
alter table public.user_settings
  add column if not exists new_tasks_position text not null default 'start' check (new_tasks_position in ('start', 'end'));

-- tasks: subtasks collapsed state, top margin/line style
alter table public.tasks
  add column if not exists subtasks_collapsed boolean not null default false,
  add column if not exists top_style int not null default 0 check (top_style >= 0 and top_style <= 2);
