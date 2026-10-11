-- Meal cards (Coverflex, Edenred, Pluxee) as their own account type, next to debit, credit, cash and savings.
-- Like a debit card it can't go below €0, and its money counts toward the spending budget.
-- Run once in Supabase Dashboard → SQL Editor.

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check check (type in ('debit', 'credit', 'cash', 'savings', 'meal'));
