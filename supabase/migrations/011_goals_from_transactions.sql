-- Savings goals follow the real money.
-- A goal's money is calculated, never stored:
--   + every transaction tagged with the goal, by how much it moves the savings accounts
--     (a transfer in adds, a transfer out or an expense paid from savings takes away)
--   + moves from other goals into it, − moves out of it to other goals (no money leaves the account)
-- Savings money without a goal is "General savings" (goal_id null): savings accounts' starting
-- balances, untagged transactions, and moves to/from null. So all goals together, General savings
-- included, always add up to the savings accounts' balance.
-- savings_goals.saved_cents is no longer used (left in place, nothing is deleted).
-- Deleting a goal hands its money to General savings (on delete set null).
-- Run once in Supabase Dashboard → SQL Editor.

-- lets other tables reference (id, user_id) so they can't point at another user's goal
alter table public.savings_goals add constraint savings_goals_id_user_id_key unique (id, user_id);

-- ───────────────────── transactions.goal_id ─────────────────────
alter table public.transactions add column goal_id uuid;
alter table public.transactions
  add constraint transactions_goal_fkey
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id)
  on delete set null (goal_id);
create index transactions_goal_id_idx on public.transactions (goal_id) where goal_id is not null;

-- ───────────────────── goal_moves ─────────────────────
-- Money moved between goals inside savings (null = General savings)
create table public.goal_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_goal_id uuid,
  to_goal_id uuid,
  amount_cents bigint not null check (amount_cents > 0),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (from_goal_id, user_id) references public.savings_goals (id, user_id) on delete set null (from_goal_id),
  foreign key (to_goal_id, user_id) references public.savings_goals (id, user_id) on delete set null (to_goal_id)
);
create index goal_moves_user_id_idx on public.goal_moves (user_id);

revoke all on public.goal_moves from anon;
grant select, insert, update, delete on public.goal_moves to authenticated;
alter table public.goal_moves enable row level security;

create policy "own rows: select" on public.goal_moves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.goal_moves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.goal_moves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.goal_moves
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ───────────────────── recurring "Paid" with a goal ─────────────────────
-- Same as migration 010, plus the goal the money comes out of (when paid from a savings account).
drop function if exists public.record_recurring_payment(uuid, date, bigint, uuid, date, date);

create or replace function public.record_recurring_payment(
  p_payment_id uuid,
  p_due date,
  p_amount_cents bigint,
  p_account_id uuid,
  p_date date,
  p_next_due date,
  p_goal_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.recurring_payments;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into r from public.recurring_payments where id = p_payment_id for update;
  if not found then
    raise exception 'This payment no longer exists.';
  end if;
  if r.next_due <> p_due then
    raise exception 'This payment was already marked as paid.';
  end if;

  insert into public.transactions (type, amount_cents, date, account_id, category_id, note, goal_id)
  values ('expense', p_amount_cents, p_date, p_account_id, r.category_id, r.name, p_goal_id);

  update public.recurring_payments set next_due = p_next_due where id = p_payment_id;
end;
$$;

revoke all on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date, uuid) from public, anon;
grant execute on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date, uuid) to authenticated;

-- ───────────────────── "Delete all data" also clears goal moves ─────────────────────
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
