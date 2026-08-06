-- Promises listed among the tasks of a day can be styled like a task: their own
-- text colour and the same three-step spacing above the row.
alter table public.reputation_promises
  add column if not exists text_color text not null default '#ffffff',
  add column if not exists top_style int not null default 0;

-- Plans / Calendar: send a fulfilled promise to the "Выполненные задачи" list
-- instead of leaving it in place.
alter table public.user_settings
  add column if not exists reputation_in_completed boolean not null default false;

-- The promises are read in two sections at once, so every device (and every
-- open tab) needs to hear about a change instead of waiting for a reload.
do $$
begin
  alter publication supabase_realtime add table public.reputation_promises;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
