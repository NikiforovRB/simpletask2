-- Per-item text color for goal_plan_items (used for day tasks).
alter table public.goal_plan_items
  add column if not exists text_color text;
