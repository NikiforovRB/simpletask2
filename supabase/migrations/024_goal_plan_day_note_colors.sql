-- Per-text color for the goal plan day notes (start_text / end_text).
alter table public.goal_plan_day_notes
  add column if not exists start_color text,
  add column if not exists end_color text;
