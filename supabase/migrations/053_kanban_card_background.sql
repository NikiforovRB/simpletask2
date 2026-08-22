-- The fill of a card. The colour is kept as chosen and thinned out to a fifth
-- when it is painted, so that a card reads as tinted rather than as a block of
-- colour, and the text on it stays legible in either theme.

alter table public.kanban_cards
  add column if not exists bg_color text;
