-- Removes the 7 tables left from before LynxOS, which the app never used (owner's request, 2026-10-17),
-- and the two old sign-up functions that filled two of them. Their last contents are in the backup
-- "LynxOS backup 2026-10-17 (before deleting old tables)" in the owner's OneDrive.
-- Nothing else depends on them (checked: no foreign keys, views or app code).

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.monthly_investment_snapshots;
drop table if exists public.investment_transactions;
drop table if exists public.holdings;
drop table if exists public.investment_accounts;
drop table if exists public.expenses;
drop table if exists public.expense_categories;
drop table if exists public.profiles; -- also removes its trigger on_profile_created_add_categories
drop function if exists public.create_default_categories();
