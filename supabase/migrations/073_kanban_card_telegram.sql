-- The Telegram username of a client, so the chat opens on that very account
-- rather than on whoever the phone number happens to belong to.

alter table public.kanban_cards
  add column if not exists telegram text not null default '';
