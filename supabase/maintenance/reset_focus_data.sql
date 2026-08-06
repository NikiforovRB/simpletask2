-- Wipes the focus timer data of the signed-in user: every logged session and
-- the row of a session that is still in progress. Run it in the Supabase SQL
-- editor when leftover rows from an older build keep producing phantom
-- sessions; it is never run automatically.
--
-- Replace the email with the account to clean, or drop the where clauses to
-- clear the data of every user.
delete from public.focus_active_sessions
where user_id in (select id from auth.users where email = 'you@example.com');

delete from public.focus_sessions
where user_id in (select id from auth.users where email = 'you@example.com');
