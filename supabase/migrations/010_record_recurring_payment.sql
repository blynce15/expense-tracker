-- "Paid" on a recurring payment: records the expense and moves the next due date forward
-- in one go, so either both happen or neither does (no half-saved payment if the
-- connection drops). It also refuses to record the same due date twice: if another tap
-- or another device already marked it paid, next_due has moved on and nothing is saved.
-- Runs with the caller's own permissions, so it can only ever touch the caller's rows.
-- Run once in Supabase Dashboard → SQL Editor.

create or replace function public.record_recurring_payment(
  p_payment_id uuid,
  p_due date,
  p_amount_cents bigint,
  p_account_id uuid,
  p_date date,
  p_next_due date
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

  insert into public.transactions (type, amount_cents, date, account_id, category_id, note)
  values ('expense', p_amount_cents, p_date, p_account_id, r.category_id, r.name);

  update public.recurring_payments set next_due = p_next_due where id = p_payment_id;
end;
$$;

revoke all on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date) from public, anon;
grant execute on function public.record_recurring_payment(uuid, date, bigint, uuid, date, date) to authenticated;
