-- The link to a client's profile in Max (max.ru/u/…). Max has no link that
-- opens a chat by phone number, so this is the one way to go straight to it.

alter table public.kanban_cards
  add column if not exists max_link text not null default '';
