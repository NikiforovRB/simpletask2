-- Open tasks left on a past day move to today on their own, timed ones
-- included (they keep their time). Off unless switched on in the settings.

alter table public.user_settings
  add column if not exists calendar_carry_over boolean not null default false;
