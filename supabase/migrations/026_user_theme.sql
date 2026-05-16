-- App-wide theme preference for the current user: 'dark' (default) or 'light'.
alter table public.user_settings
  add column if not exists theme text not null default 'dark'
  check (theme in ('dark', 'light'));
