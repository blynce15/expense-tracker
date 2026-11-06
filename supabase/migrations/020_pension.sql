-- Pension fund (Investments → Pension): one row per month, entered by hand.
-- value_cents = what the fund is worth on `date`; put_in_cents = money added since the previous entry
-- (the first entry = everything put in so far); units = units held. The fund's name and provider live in
-- user_settings.answers.pension. Not an account: no money moves, it only counts in net worth.

create table public.pension_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null default current_date,
  value_cents bigint not null check (value_cents >= 0 and value_cents <= 999999999),
  put_in_cents bigint not null default 0 check (put_in_cents >= 0 and put_in_cents <= 999999999),
  units numeric(20, 6) not null check (units >= 0),
  created_at timestamptz not null default now()
);
-- One entry per calendar month
create unique index pension_entries_user_month_idx
  on public.pension_entries (user_id, (extract(year from date)), (extract(month from date)));

revoke all on public.pension_entries from anon;
grant select, insert, update, delete on public.pension_entries to authenticated;
-- The daily reminder job (api/remind.js) checks who needs a monthly update
grant select on public.pension_entries to service_role;
alter table public.pension_entries enable row level security;

create policy "own rows: select" on public.pension_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.pension_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.pension_entries
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.pension_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- "Delete all my data" also clears the pension
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

  -- Transactions and recurring payments first: they point at accounts, categories and goals
  delete from public.transactions where user_id = uid;
  delete from public.recurring_payments where user_id = uid;
  delete from public.goal_moves where user_id = uid;
  delete from public.savings_goals where user_id = uid;
  delete from public.pension_entries where user_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.accounts where user_id = uid;
  delete from public.categories where user_id = uid;

  -- Name, photo, default account, getquin, broker cash, pension fund and budget day go; onboarding starts again
  update public.user_settings
     set answers = '{}'::jsonb, onboarded_at = null, budget_start_day = 1
   where user_id = uid;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
