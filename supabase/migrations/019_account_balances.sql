-- Account balances worked out in the database (2026-10-17). Before this the app downloaded every
-- transaction to add them up, which gets slower every month and breaks after 1.000 transactions
-- (Supabase sends at most 1.000 rows per request). This returns one row per account instead:
-- how much its transactions changed it, and how many there are. Balance = starting balance + change.
-- Same rule as src/lib/balances.js: income and divest add, expense and invest take away, a transfer
-- takes from account_id and adds to to_account_id.
-- security invoker: it runs as the signed-in user, so Row Level Security only lets it see their rows.

create or replace function public.account_balances()
returns table (account_id uuid, change_cents bigint, transaction_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.account_id, sum(x.cents)::bigint, count(*)::bigint
  from (
    select t.account_id, case when t.type in ('income', 'divest') then t.amount_cents else -t.amount_cents end as cents
    from public.transactions t
    union all
    select t.to_account_id, t.amount_cents
    from public.transactions t
    where t.type = 'transfer'
  ) x
  group by x.account_id
$$;

revoke execute on function public.account_balances() from public, anon;
grant execute on function public.account_balances() to authenticated;
