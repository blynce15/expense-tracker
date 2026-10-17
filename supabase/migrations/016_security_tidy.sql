-- Security tidy-up after the 2026-10-17 review. Changes no data.
-- 1. The two old sign-up functions from before LynxOS (they fill the unused profiles / expense_categories
--    tables when a user is created) run with extra rights, so they get a fixed, empty search path and
--    nobody can call them directly. Triggers keep working: Postgres doesn't check EXECUTE when firing them.
-- 2. App users (anon = signed out, authenticated = signed in) lose TRUNCATE ("empty a whole table"),
--    which skips Row Level Security. The app never uses it and the Data API can't reach it; this is hygiene.
--    Also for tables created later.

alter function public.handle_new_user() set search_path = '';
alter function public.create_default_categories() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_default_categories() from public, anon, authenticated;

revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
