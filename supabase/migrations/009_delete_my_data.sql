-- "Delete all my data" (Profile → Danger zone): removes everything the signed-in user has stored,
-- in one go: either all of it is deleted or none of it is. The login itself stays, and
-- the settings row is reset so the app starts over with onboarding.
-- Runs with the caller's own permissions, so it can only ever touch the caller's rows.
-- Run once in Supabase Dashboard → SQL Editor.

create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Transactions and recurring payments first: they point at accounts and categories
  delete from public.transactions where user_id = uid;
  delete from public.recurring_payments where user_id = uid;
  delete from public.savings_goals where user_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.accounts where user_id = uid;
  delete from public.categories where user_id = uid;

  -- Name, photo, default account, About-you answers and budget day go; onboarding starts again
  update public.user_settings
     set answers = '{}'::jsonb, onboarded_at = null, budget_start_day = 1
   where user_id = uid;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
