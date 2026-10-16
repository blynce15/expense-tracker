-- Invest transactions (2026-10-16): money put into investments ('invest', leaves account_id) or taken
-- back out of them ('divest', arrives in account_id). Neither is spending or income; there's no
-- investment account on the other side (the portfolio lives in getquin). No category.
-- Rules are enforced in the app (src/lib/balances.js). Run once in Supabase Dashboard → SQL Editor.

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('expense', 'income', 'transfer', 'invest', 'divest'));

alter table public.transactions drop constraint if exists invest_shape;
alter table public.transactions
  add constraint invest_shape check (type not in ('invest', 'divest') or category_id is null);
