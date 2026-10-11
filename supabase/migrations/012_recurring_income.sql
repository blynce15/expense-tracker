-- Recurring income (salary, meal card…) next to recurring payments.
-- A recurring entry is now either a payment (expense, as before) or income. "Received" on an income
-- entry records an income transaction, the same way "Paid" records an expense.
-- Run once in Supabase Dashboard → SQL Editor.

alter table public.recurring_payments
  add column type text not null default 'expense' check (type in ('expense', 'income'));

-- Same as migration 011, but the transaction gets the entry's own type (expense or income)
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
    raise exception 'This payment was already recorded.';
  end if;

  insert into public.transactions (type, amount_cents, date, account_id, category_id, note, goal_id)
  values (r.type, p_amount_cents, p_date, p_account_id, r.category_id, r.name, p_goal_id);

  update public.recurring_payments set next_due = p_next_due where id = p_payment_id;
end;
$$;

revoke all on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date, uuid) from public, anon;
grant execute on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date, uuid) to authenticated;
