-- Plans / Calendar: list the day's "Репутация перед собой" promises together
-- with the tasks of that day.
alter table public.user_settings
  add column if not exists show_reputation_in_lists boolean not null default false;
