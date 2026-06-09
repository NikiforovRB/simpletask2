-- Superadmin user management + project/board sharing
-- Superadmin email is hardcoded for the security check below.

-- ---------------------------------------------------------------------------
-- profiles: mirror of auth.users with role + (insecure) plaintext password
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'superadmin')),
  password_plain text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- JWT-based superadmin check (no profiles lookup -> avoids RLS recursion)
create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rodionnrb@gmail.com';
$$;

drop policy if exists "profiles self or superadmin read" on public.profiles;
create policy "profiles self or superadmin read"
  on public.profiles for select
  using (auth.uid() = id or public.is_superadmin());

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles self or superadmin update" on public.profiles;
create policy "profiles self or superadmin update"
  on public.profiles for update
  using (auth.uid() = id or public.is_superadmin())
  with check (auth.uid() = id or public.is_superadmin());

-- Prevent privilege escalation: only a superadmin may change the role column.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null when run from a trusted server context (SQL editor /
  -- service role); only block role changes for ordinary authenticated users.
  if auth.uid() is not null and not public.is_superadmin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_trg on public.profiles;
create trigger profiles_guard_role_trg
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- Auto-create a profile row whenever an auth user is created.
-- App-specific names so this coexists with any other app sharing auth.users
-- (e.g. a different app's own on_auth_user_created trigger).
create or replace function public.simpletasks_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.email = 'rodionnrb@gmail.com' then 'superadmin' else 'user' end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists simpletasks_on_auth_user_created on auth.users;
create trigger simpletasks_on_auth_user_created
  after insert on auth.users
  for each row execute function public.simpletasks_handle_new_user();

-- Backfill profiles for existing users.
insert into public.profiles (id, email, role)
select
  u.id,
  u.email,
  case when u.email = 'rodionnrb@gmail.com' then 'superadmin' else 'user' end
from auth.users u
on conflict (id) do update
  set email = excluded.email,
      role = case when public.profiles.email = 'rodionnrb@gmail.com' then 'superadmin' else public.profiles.role end;

-- ---------------------------------------------------------------------------
-- project_members: collaborators on a project/board
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.task_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table public.project_members enable row level security;

-- Access helpers (security definer -> bypass RLS internally, avoid recursion)
create or replace function public.is_project_owner(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_projects
    where id = pid and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid()
  );
$$;

drop policy if exists "project_members read" on public.project_members;
create policy "project_members read"
  on public.project_members for select
  using (public.is_project_owner(project_id) or user_id = auth.uid());

drop policy if exists "project_members owner insert" on public.project_members;
create policy "project_members owner insert"
  on public.project_members for insert
  with check (public.is_project_owner(project_id));

drop policy if exists "project_members owner or self delete" on public.project_members;
create policy "project_members owner or self delete"
  on public.project_members for delete
  using (public.is_project_owner(project_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Member access policies (members can read + edit, but NOT delete the project)
-- ---------------------------------------------------------------------------
drop policy if exists "members read shared projects" on public.task_projects;
create policy "members read shared projects"
  on public.task_projects for select
  using (public.is_project_member(id));

drop policy if exists "members update shared projects" on public.task_projects;
create policy "members update shared projects"
  on public.task_projects for update
  using (public.is_project_member(id))
  with check (public.is_project_member(id));

-- Members can fully manage tasks within a shared project.
drop policy if exists "members manage shared project tasks" on public.tasks;
create policy "members manage shared project tasks"
  on public.tasks for all
  using (project_id is not null and public.is_project_member(project_id))
  with check (project_id is not null and public.is_project_member(project_id));

-- Owners can see/manage tasks created by collaborators in their projects.
drop policy if exists "owners manage project tasks" on public.tasks;
create policy "owners manage project tasks"
  on public.tasks for all
  using (project_id is not null and public.is_project_owner(project_id))
  with check (project_id is not null and public.is_project_owner(project_id));

-- Members can fully manage items within a shared board.
drop policy if exists "members manage shared board items" on public.board_items;
create policy "members manage shared board items"
  on public.board_items for all
  using (board_id is not null and public.is_project_member(board_id))
  with check (board_id is not null and public.is_project_member(board_id));

-- Owners can see/manage board items created by collaborators in their boards.
drop policy if exists "owners manage board items" on public.board_items;
create policy "owners manage board items"
  on public.board_items for all
  using (board_id is not null and public.is_project_owner(board_id))
  with check (board_id is not null and public.is_project_owner(board_id));

-- ---------------------------------------------------------------------------
-- RPCs: share by email + list members (resolve email via profiles)
-- ---------------------------------------------------------------------------
create or replace function public.share_project(p_project_id uuid, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not exists (
    select 1 from public.task_projects
    where id = p_project_id and user_id = auth.uid()
  ) then
    return json_build_object('ok', false, 'error', 'not_owner');
  end if;

  select id into v_uid
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_uid is null then
    return json_build_object('ok', false, 'error', 'user_not_found');
  end if;

  if v_uid = auth.uid() then
    return json_build_object('ok', false, 'error', 'self');
  end if;

  insert into public.project_members (project_id, user_id)
  values (p_project_id, v_uid)
  on conflict (project_id, user_id) do nothing;

  return json_build_object('ok', true, 'user_id', v_uid, 'email', lower(trim(p_email)));
end;
$$;

create or replace function public.list_project_members(p_project_id uuid)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select pm.user_id, pr.email
  from public.project_members pm
  join public.profiles pr on pr.id = pm.user_id
  where pm.project_id = p_project_id
    and (public.is_project_owner(p_project_id) or pm.user_id = auth.uid())
  order by pm.created_at asc;
$$;

-- Enable realtime for project_members (ignore if already in the publication).
do $$
begin
  alter publication supabase_realtime add table public.project_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
