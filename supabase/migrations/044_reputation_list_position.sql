-- Where a promise sits among the tasks of its day in Plans / Calendar.
-- The value lives in "task index" space: 2.5 means "between the third and the
-- fourth task", so the promise keeps its place while the tasks around it change.
-- Null keeps the promise after all tasks, which is where they start out.
alter table public.reputation_promises
  add column if not exists list_position double precision;
