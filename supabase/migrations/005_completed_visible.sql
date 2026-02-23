-- Persist "Show/Hide completed tasks" per user
alter table public.user_settings
  add column if not exists completed_visible boolean not null default true;
