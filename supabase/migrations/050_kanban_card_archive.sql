-- Deleting a card used to take its description and its whole task list with
-- it, with nothing to undo. A card is now archived instead: the row stays,
-- marked with the moment it was thrown away, and is only really deleted by
-- hand or once it has spent 30 days in the archive.
--
-- `column_id` has to give way, because a card outlives the column it was
-- deleted with: deleting a column archives its cards, and the cascade would
-- take them along if they were still pointing at it. Where they came from is
-- kept in `archived_column_id`, which is a plain uuid on purpose — it has to
-- survive the column it names, and it is only ever used to offer the card its
-- old place back.

alter table public.kanban_cards
  add column if not exists deleted_at timestamptz,
  add column if not exists archived_column_id uuid;

alter table public.kanban_cards alter column column_id drop not null;

create index if not exists kanban_cards_archive on public.kanban_cards(board_id, deleted_at);
