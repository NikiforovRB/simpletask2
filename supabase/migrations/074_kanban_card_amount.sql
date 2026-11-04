-- What a client's deal is worth, shown on the card of a CRM board.

alter table public.kanban_cards
  add column if not exists amount numeric;
