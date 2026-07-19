-- ============================================================
-- simple-tasks2 — FULL schema setup (migrations 001..036 combined)
-- Run once in the Supabase SQL Editor of the target project.
-- ============================================================


-- >>>>>>>>>> 001_schema.sql >>>>>>>>>>

-- User settings: days count (1-7)
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  days_count int not null default 3 check (days_count >= 1 and days_count <= 7),
  unique(user_id)
);

-- Tasks: top-level and subtasks (parent_id null = top-level)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  scheduled_date date,
  completed_at timestamptz,
  position int not null default 0,
  text_color text not null default '#e0e0e0'
);

create index tasks_user_date on public.tasks(user_id, scheduled_date);
create index tasks_user_parent on public.tasks(user_id, parent_id);
create index tasks_user_completed on public.tasks(user_id, completed_at);

alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

create policy "Users can manage own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- >>>>>>>>>> 002_new_columns.sql >>>>>>>>>>

-- user_settings: where to add new tasks
alter table public.user_settings
  add column if not exists new_tasks_position text not null default 'start' check (new_tasks_position in ('start', 'end'));

-- tasks: subtasks collapsed state, top margin/line style
alter table public.tasks
  add column if not exists subtasks_collapsed boolean not null default false,
  add column if not exists top_style int not null default 0 check (top_style >= 0 and top_style <= 2);


-- >>>>>>>>>> 003_no_date_visible.sql >>>>>>>>>>

alter table public.user_settings
  add column if not exists no_date_list_visible boolean not null default true;


-- >>>>>>>>>> 004_list_collapsed.sql >>>>>>>>>>

-- Store collapsed state for any list: day card, no-date list, completed list per day or no-date
create table if not exists public.user_list_collapsed (
  user_id uuid not null references auth.users(id) on delete cascade,
  list_key text not null,
  collapsed boolean not null default false,
  primary key (user_id, list_key)
);

alter table public.user_list_collapsed enable row level security;

create policy "Users can manage own list collapsed"
  on public.user_list_collapsed for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- >>>>>>>>>> 005_completed_visible.sql >>>>>>>>>>

-- Persist "Show/Hide completed tasks" per user
alter table public.user_settings
  add column if not exists completed_visible boolean not null default true;


-- >>>>>>>>>> 006_projects_and_buckets.sql >>>>>>>>>>

-- Projects and list types for tasks
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.task_projects enable row level security;

create policy "Users can manage own projects"
  on public.task_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.tasks
  add column if not exists list_type text not null default 'inbox' check (list_type in ('inbox','someday','project')),
  add column if not exists project_id uuid references public.task_projects(id) on delete cascade;



-- >>>>>>>>>> 007_projects_and_tasks_columns.sql >>>>>>>>>>

-- Ensure projects and list_type/project_id exist (idempotent).
-- Run this if tasks for projects do not show or columns are missing.

-- Projects table (same as 006)
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.task_projects enable row level security;

drop policy if exists "Users can manage own projects" on public.task_projects;
create policy "Users can manage own projects"
  on public.task_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tasks: add list_type and project_id if missing
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'list_type'
  ) then
    alter table public.tasks
      add column list_type text not null default 'inbox'
      check (list_type in ('inbox','someday','project'));
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'project_id'
  ) then
    alter table public.tasks
      add column project_id uuid references public.task_projects(id) on delete cascade;
  end if;
end $$;


-- >>>>>>>>>> 008_project_position.sql >>>>>>>>>>

-- Order of projects in the menu
alter table public.task_projects
  add column if not exists position int not null default 0;


-- >>>>>>>>>> 009_tasks_replica_identity.sql >>>>>>>>>>

-- Realtime DELETE filters need old row columns (e.g. user_id). Default replica identity
-- only sends the primary key, so postgres_changes with filter never matched DELETEs.
alter table public.tasks replica identity full;


-- >>>>>>>>>> 010_sidebar_width.sql >>>>>>>>>>

alter table public.user_settings
  add column if not exists sidebar_width_px int not null default 220
  check (sidebar_width_px >= 100 and sidebar_width_px <= 400);


-- >>>>>>>>>> 011_task_font_settings.sql >>>>>>>>>>

-- Task title font weight and scale (tasks/subtasks only)
alter table public.user_settings
  add column if not exists task_font_weight text not null default 'medium'
  check (task_font_weight in ('light', 'regular', 'medium', 'semibold'));

alter table public.user_settings
  add column if not exists task_font_scale numeric not null default 1;


-- >>>>>>>>>> 012_habits.sql >>>>>>>>>>

-- Habits and daily entries (payload mirrors client: yes_no, num, time)
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('yes_no', 'not_more', 'not_less', 'not_later')),
  limit_number double precision,
  limit_time text,
  skip_mode text not null default 'none' check (skip_mode in ('none', 'every_other', 'every_third')),
  streak_enabled boolean not null default true,
  anchor_date date not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists habits_user_position on public.habits(user_id, position);

alter table public.habits enable row level security;

drop policy if exists "Users can manage own habits" on public.habits;
create policy "Users can manage own habits"
  on public.habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.habit_entries (
  habit_id uuid not null references public.habits(id) on delete cascade,
  entry_date date not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (habit_id, entry_date)
);

create index if not exists habit_entries_habit on public.habit_entries(habit_id);

alter table public.habit_entries enable row level security;

drop policy if exists "Users can manage own habit entries" on public.habit_entries;
create policy "Users can manage own habit entries"
  on public.habit_entries for all
  using (
    exists (
      select 1 from public.habits h
      where h.id = habit_entries.habit_id and h.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.habits h
      where h.id = habit_entries.habit_id and h.user_id = auth.uid()
    )
  );

alter table public.habits replica identity full;
alter table public.habit_entries replica identity full;

-- Включите Realtime для таблиц habits и habit_entries в Supabase: Project → Database → Publications → supabase_realtime


-- >>>>>>>>>> 013_habits_sidebar_width.sql >>>>>>>>>>

alter table public.user_settings
  add column if not exists habits_sidebar_width_px int not null default 220
  check (habits_sidebar_width_px >= 100 and habits_sidebar_width_px <= 400);


-- >>>>>>>>>> 014_habits_simple_types.sql >>>>>>>>>>

-- Расширяем перечень типов привычек: добавляем "Просто время" и "Просто текст"
alter table public.habits
  drop constraint if exists habits_type_check;

alter table public.habits
  add constraint habits_type_check
  check (type in ('yes_no', 'not_more', 'not_less', 'not_later', 'just_time', 'just_text'));


-- >>>>>>>>>> 015_board.sql >>>>>>>>>>

-- Board items (section "Доска")
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  x int not null default 0,
  y int not null default 0,
  width int not null default 200,
  height int not null default 100,
  text_color text not null default '#ffffff',
  has_border boolean not null default false,
  padding int not null default 10,
  z_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_items_user on public.board_items(user_id);

alter table public.board_items enable row level security;

drop policy if exists "Users can manage own board items" on public.board_items;
create policy "Users can manage own board items"
  on public.board_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.board_items replica identity full;

-- Board preferences in user_settings
alter table public.user_settings
  add column if not exists board_zoom int not null default 100
  check (board_zoom >= 25 and board_zoom <= 200);

alter table public.user_settings
  add column if not exists board_dots boolean not null default false;

-- Включите Realtime для таблицы board_items: Project → Database → Publications → supabase_realtime


-- >>>>>>>>>> 016_board_items_more.sql >>>>>>>>>>

-- Extra settings for board text blocks: text scale and border color
alter table public.board_items
  add column if not exists text_scale real not null default 1
  check (text_scale >= 0.4 and text_scale <= 3);

alter table public.board_items
  add column if not exists border_color text not null default '#2f2f2f';


-- >>>>>>>>>> 017_boards_in_projects.sql >>>>>>>>>>

-- Unify projects and custom boards in a single left-menu list.
-- task_projects now has a "kind" discriminator:
--   'project' = regular list of tasks (default)
--   'board'   = free-form board with its own text blocks
alter table public.task_projects
  add column if not exists kind text not null default 'project'
  check (kind in ('project', 'board'));

-- Scope board items to a specific custom board (or keep NULL for the
-- built-in "Доска" menu item that cannot be deleted).
alter table public.board_items
  add column if not exists board_id uuid
  references public.task_projects(id) on delete cascade;

create index if not exists board_items_board on public.board_items(board_id);


-- >>>>>>>>>> 018_board_items_border_radius.sql >>>>>>>>>>

alter table public.board_items
  add column if not exists border_radius int not null default 0
  check (border_radius >= 0 and border_radius <= 100);


-- >>>>>>>>>> 019_board_items_kind.sql >>>>>>>>>>

-- Board item kinds: text block, vertical line, horizontal line
alter table public.board_items
  add column if not exists kind text not null default 'text'
  check (kind in ('text', 'line_v', 'line_h'));

-- Allow lines to be 1px thick. Drop the previous min-size constraints if they
-- were defined on width/height (this app does not enforce them in SQL, but be
-- safe in case a constraint exists with this name).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'board_items_width_min'
  ) then
    alter table public.board_items drop constraint board_items_width_min;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'board_items_height_min'
  ) then
    alter table public.board_items drop constraint board_items_height_min;
  end if;
end $$;


-- >>>>>>>>>> 020_board_items_text_font_weight.sql >>>>>>>>>>

alter table public.board_items
  add column if not exists text_font_weight text not null default 'medium'
  check (text_font_weight in ('light', 'regular', 'medium', 'semibold', 'bold'));


-- >>>>>>>>>> 021_habits_just_text_color.sql >>>>>>>>>>

-- Добавляем тип привычек "Просто текст с цветом" (just_text_color)
alter table public.habits
  drop constraint if exists habits_type_check;

alter table public.habits
  add constraint habits_type_check
  check (type in ('yes_no', 'not_more', 'not_less', 'not_later', 'just_time', 'just_text', 'just_text_color'));


-- >>>>>>>>>> 022_goal_plan.sql >>>>>>>>>>

-- Раздел «Планы с целями»:
--   * goal_plan_items — единый список со всеми пунктами разных секций:
--       kind = 'goal'   — Мои цели
--       kind = 'morning'— Утро (каждое утро)
--       kind = 'evening'— Вечер (каждый вечер)
--       kind = 'action' — Задачи для достижения цели (поддерживает подзадачи через parent_id)
--       kind = 'day'    — Задачи конкретного дня (entry_date != null)
--   * goal_plan_day_notes — фиксированный текст в начале и в конце дня.

create table if not exists public.goal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'morning', 'evening', 'action', 'day')),
  parent_id uuid references public.goal_plan_items(id) on delete cascade,
  text text not null default '',
  completed_at timestamptz,
  position int not null default 0,
  entry_date date,
  goal_id uuid references public.goal_plan_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists goal_plan_items_user_kind_pos
  on public.goal_plan_items(user_id, kind, position);
create index if not exists goal_plan_items_user_kind_date
  on public.goal_plan_items(user_id, kind, entry_date);
create index if not exists goal_plan_items_user_parent
  on public.goal_plan_items(user_id, parent_id);

alter table public.goal_plan_items enable row level security;

drop policy if exists "Users can manage own goal_plan_items" on public.goal_plan_items;
create policy "Users can manage own goal_plan_items"
  on public.goal_plan_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.goal_plan_day_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  start_text text not null default '',
  end_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.goal_plan_day_notes enable row level security;

drop policy if exists "Users can manage own goal_plan_day_notes" on public.goal_plan_day_notes;
create policy "Users can manage own goal_plan_day_notes"
  on public.goal_plan_day_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.goal_plan_items replica identity full;
alter table public.goal_plan_day_notes replica identity full;

-- В Supabase Dashboard включите Realtime для таблиц goal_plan_items и goal_plan_day_notes.


-- >>>>>>>>>> 023_goal_plan_text_color.sql >>>>>>>>>>

-- Per-item text color for goal_plan_items (used for day tasks).
alter table public.goal_plan_items
  add column if not exists text_color text;


-- >>>>>>>>>> 024_goal_plan_day_note_colors.sql >>>>>>>>>>

-- Per-text color for the goal plan day notes (start_text / end_text).
alter table public.goal_plan_day_notes
  add column if not exists start_color text,
  add column if not exists end_color text;


-- >>>>>>>>>> 025_goal_plan_subtasks_collapsed.sql >>>>>>>>>>

-- Per-item collapsed/expanded state for subtask lists in goal_plan_items.
alter table public.goal_plan_items
  add column if not exists subtasks_collapsed boolean not null default false;


-- >>>>>>>>>> 026_user_theme.sql >>>>>>>>>>

-- App-wide theme preference for the current user: 'dark' (default) or 'light'.
alter table public.user_settings
  add column if not exists theme text not null default 'dark'
  check (theme in ('dark', 'light'));


-- >>>>>>>>>> 027_goal_plan_top_gap.sql >>>>>>>>>>

-- Per-item top-gap flag for goal_plan_items.
-- When true, the row gets an extra 40px of breathing room above it inside
-- the day list. Toggleable from the row toolbar; currently only surfaced
-- for top-level day tasks but stored generically.
alter table public.goal_plan_items
  add column if not exists top_gap boolean not null default false;


-- >>>>>>>>>> 028_focus_and_task_time.sql >>>>>>>>>>

-- Feature: task time-of-day + local reminders, and focus/Pomodoro sessions.

-- 1. Time-of-day and reminder offset for tasks. `scheduled_time` is a local
--    wall-clock time (no timezone) paired with the existing `scheduled_date`.
--    `reminder_minutes` is how many minutes BEFORE the time to notify:
--    null = no reminder, 0 = at the exact time, otherwise 5/10/30/60.
alter table public.tasks
  add column if not exists scheduled_time time,
  add column if not exists reminder_minutes int;

-- Same for goal-plan day items (they already carry an entry_date).
alter table public.goal_plan_items
  add column if not exists scheduled_time time,
  add column if not exists reminder_minutes int;

-- 2. Focus / Pomodoro sessions. A session can target a task (from any list or
--    project) or a goal-plan item, or be a free-standing focus block. We store
--    a denormalized title + a string id (no FK, since it may point at either
--    table) so analytics survive the source row being deleted.
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_ref text,
  task_title text not null default '',
  source text not null default 'custom' check (source in ('task', 'goal_plan', 'custom')),
  mode text not null default 'stopwatch' check (mode in ('pomodoro', 'stopwatch')),
  duration_seconds int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_started
  on public.focus_sessions(user_id, started_at);

alter table public.focus_sessions enable row level security;

drop policy if exists "Users can manage own focus_sessions" on public.focus_sessions;
create policy "Users can manage own focus_sessions"
  on public.focus_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.focus_sessions replica identity full;


-- >>>>>>>>>> 029_superadmin_and_sharing.sql >>>>>>>>>>

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


-- >>>>>>>>>> 030_realtime_broadcast.sql >>>>>>>>>>

-- Reliable realtime for collaboration via Supabase Broadcast (from the database).
-- Any change to a project's tasks / board items / the project row / its members
-- emits a lightweight broadcast on topic `project:<project_id>`. Clients
-- subscribed to that topic refetch. The payload carries NO row data (only the
-- table name + operation), so it is safe to send on a public broadcast topic;
-- the actual data stays protected by table RLS when the client refetches.

create or replace function public.broadcast_project_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  rec record;
  pid uuid;
begin
  if tg_op = 'DELETE' then
    rec := old;
  else
    rec := new;
  end if;

  if tg_table_name = 'tasks' then
    pid := rec.project_id;
  elsif tg_table_name = 'board_items' then
    pid := rec.board_id;
  elsif tg_table_name = 'task_projects' then
    pid := rec.id;
  elsif tg_table_name = 'project_members' then
    pid := rec.project_id;
  end if;

  if pid is not null then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'db_change',
      'project:' || pid::text,
      false  -- public topic; payload contains no row data
    );
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_tasks_change on public.tasks;
create trigger broadcast_tasks_change
  after insert or update or delete on public.tasks
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_board_items_change on public.board_items;
create trigger broadcast_board_items_change
  after insert or update or delete on public.board_items
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_task_projects_change on public.task_projects;
create trigger broadcast_task_projects_change
  after insert or update or delete on public.task_projects
  for each row execute function public.broadcast_project_change();

drop trigger if exists broadcast_project_members_change on public.project_members;
create trigger broadcast_project_members_change
  after insert or update or delete on public.project_members
  for each row execute function public.broadcast_project_change();


-- >>>>>>>>>> 031_calendar.sql >>>>>>>>>>

-- Calendar mode: timeline events + per-user timeline hours.

-- Timeline start/end hour (0..24) for the calendar view.
alter table public.user_settings
  add column if not exists calendar_start_hour int not null default 8 check (calendar_start_hour >= 0 and calendar_start_hour <= 23),
  add column if not exists calendar_end_hour int not null default 22 check (calendar_end_hour >= 1 and calendar_end_hour <= 24);

-- Calendar events. Timed events use start_minute/end_minute (minutes from
-- midnight); all-day (unbound) events sit above the timeline for that day.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  event_date date not null,
  all_day boolean not null default false,
  start_minute int,
  end_minute int,
  color text not null default '#5a86ee',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_user_date on public.calendar_events(user_id, event_date);

alter table public.calendar_events enable row level security;

drop policy if exists "Users can manage own calendar_events" on public.calendar_events;
create policy "Users can manage own calendar_events"
  on public.calendar_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.calendar_events replica identity full;


-- >>>>>>>>>> 032_calendar_scale.sql >>>>>>>>>>

-- Calendar: timeline zoom scale (1x / 2x / 3x).
alter table public.user_settings
  add column if not exists calendar_scale int not null default 1 check (calendar_scale >= 1 and calendar_scale <= 3);


-- >>>>>>>>>> 033_calendar_completed.sql >>>>>>>>>>

-- Calendar: allow marking events as completed (checkbox on no-time items).
alter table public.calendar_events
  add column if not exists completed boolean not null default false;


-- >>>>>>>>>> 034_calendar_scale_fractional.sql >>>>>>>>>>

-- Calendar: allow fractional timeline scale (1x, 1.2x, ... 3x).
alter table public.user_settings
  drop constraint if exists user_settings_calendar_scale_check;

alter table public.user_settings
  alter column calendar_scale type numeric(3,1) using round(calendar_scale::numeric, 1);

alter table public.user_settings
  alter column calendar_scale set default 1;

alter table public.user_settings
  add constraint user_settings_calendar_scale_check
  check (calendar_scale >= 1 and calendar_scale <= 3);


-- >>>>>>>>>> 035_task_end_time.sql >>>>>>>>>>

-- Calendar/Plans sync: tasks get an optional end time.
-- A task with scheduled_time (+ scheduled_end_time) renders on the Calendar
-- timeline and with a "13:00 - 13:30 •" prefix in Plans.
alter table public.tasks
  add column if not exists scheduled_end_time time;


-- >>>>>>>>>> 036_reputation.sql >>>>>>>>>>

-- "Репутация перед собой" — daily self-promises with plan/fact tracking.
-- kind: 'yesno' (done flag), 'time' (plan/fact minutes), 'count' (plan/fact count).
create table if not exists public.reputation_promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  promise_date date not null,
  title text not null default '',
  kind text not null default 'yesno' check (kind in ('yesno', 'time', 'count')),
  plan_value int,   -- minutes (time) or target count (count); null for yesno
  fact_value int,   -- minutes (time) or actual count (count); null until recorded
  done boolean not null default false, -- yesno completion flag
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists reputation_promises_user_date
  on public.reputation_promises(user_id, promise_date);

alter table public.reputation_promises enable row level security;

drop policy if exists "Users can manage own reputation_promises" on public.reputation_promises;
create policy "Users can manage own reputation_promises"
  on public.reputation_promises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.reputation_promises replica identity full;

