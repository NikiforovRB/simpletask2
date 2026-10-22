-- «Деньги»: the card is a list of sums. Each task line starts with its amount
-- ("249 • MMB", "249 + 249 • Агрозаказ"); the card shows the amounts in place
-- of the checkboxes and the total under the list.
alter table public.kanban_cards
  add column if not exists money_mode boolean not null default false;
