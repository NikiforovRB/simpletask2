-- «Планер»: the order of the cards inside a day, set by dragging. Null — not
-- arranged by hand yet: such a card goes after the arranged ones, by time.
-- Dates (girls.dates) keep the same thing in their own `pos` field.
alter table public.girl_tasks add column if not exists position double precision;
