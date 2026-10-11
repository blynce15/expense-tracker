-- Investment accounts (e.g. Trade Republic) as their own account type, next to debit, credit, cash, savings and meal.
-- Money only goes in (transfers into it); the balance is how much has been invested, not its market value.
-- Not counted in the total balance or the budget. Rules are enforced in the app (src/lib/balances.js).
-- Run once in Supabase Dashboard → SQL Editor.

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check check (type in ('debit', 'credit', 'cash', 'savings', 'meal', 'investment'));
