-- Per-item collapsed/expanded state for subtask lists in goal_plan_items.
alter table public.goal_plan_items
  add column if not exists subtasks_collapsed boolean not null default false;
