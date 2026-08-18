-- Two more switches for a kanban board.

-- A press on the free part of a column opens a field for a new card. It is
-- handy while filling a board and in the way while reading one, so it can be
-- turned off per board.
alter table public.task_projects
  add column if not exists kanban_quick_add boolean not null default true;

-- A card can be folded down to its title: the description and the task list
-- are hidden until it is opened up again. Like the folded state of a column,
-- it belongs to the card, so a shared board looks the same to everyone.
alter table public.kanban_cards
  add column if not exists collapsed boolean not null default false;
