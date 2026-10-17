-- Housekeeping (owner's request, 2026-10-17). Backup first: "LynxOS backup 2026-10-17 (before housekeeping)".
-- 1. Account types: only the four the app offers. 'credit' (removed 2026-10-14) and 'investment' (removed
--    2026-10-14) had no accounts left.
-- 2. savings_goals.saved_cents: unused since migration 011 (a goal's money is calculated); always 0.

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check check (type in ('debit', 'cash', 'savings', 'meal'));

alter table public.savings_goals drop column if exists saved_cents;
