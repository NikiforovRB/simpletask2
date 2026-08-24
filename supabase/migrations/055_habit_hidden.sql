-- A habit kept out of the table without being deleted: the entries it already
-- has stay where they are, and it can be brought back from the order dialog.

alter table public.habits
  add column if not exists hidden boolean not null default false;
