alter table public.user_settings
  add column if not exists no_date_list_visible boolean not null default true;
