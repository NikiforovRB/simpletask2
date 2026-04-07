-- Task title font weight and scale (tasks/subtasks only)
alter table public.user_settings
  add column if not exists task_font_weight text not null default 'medium'
  check (task_font_weight in ('light', 'regular', 'medium', 'semibold'));

alter table public.user_settings
  add column if not exists task_font_scale numeric not null default 1;
