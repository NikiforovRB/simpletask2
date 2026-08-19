-- Where a card stands inside its day. Cards due on the same day come from all
-- over the board, so `position` — which orders a card inside its own column —
-- says nothing about the order they should be worked through in. This is the
-- order the day itself was put in by hand.
--
-- Null means the card has never been placed in its day: it joins the end of it
-- and keeps the order it has on the board. A card given a new date loses the
-- place it held in the old one, so it starts out null again.

alter table public.kanban_cards
  add column if not exists due_position int;
