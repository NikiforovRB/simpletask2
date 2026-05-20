-- Per-item top-gap flag for goal_plan_items.
-- When true, the row gets an extra 40px of breathing room above it inside
-- the day list. Toggleable from the row toolbar; currently only surfaced
-- for top-level day tasks but stored generically.
alter table public.goal_plan_items
  add column if not exists top_gap boolean not null default false;
