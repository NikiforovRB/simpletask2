-- What a touch with a client was, when it was more than a message: a video
-- call or a meeting in person. Counted day by day in the stats of the board.

alter table public.kanban_touches
  add column if not exists meeting text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kanban_touches_meeting_check'
  ) then
    alter table public.kanban_touches
      add constraint kanban_touches_meeting_check check (meeting in ('video', 'live'));
  end if;
end $$;
