-- Recurring payments (subscriptions, rent, bills).
-- Run once in Supabase Dashboard → SQL Editor.

create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text,
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- The first due date; later dates keep its day of the month (e.g. always the 31st, or the last day in shorter months)
  start_date date not null,
  next_due date not null,
  account_id uuid not null,
  category_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);
create index recurring_payments_user_due_idx on public.recurring_payments (user_id, next_due);
create index recurring_payments_account_id_idx on public.recurring_payments (account_id);
create index recurring_payments_category_id_idx on public.recurring_payments (category_id) where category_id is not null;

-- Same access rules as every other table: only your own rows, only when logged in
revoke all on public.recurring_payments from anon;
grant select, insert, update, delete on public.recurring_payments to authenticated;

alter table public.recurring_payments enable row level security;

create policy "own rows: select" on public.recurring_payments
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "own rows: insert" on public.recurring_payments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own rows: update" on public.recurring_payments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own rows: delete" on public.recurring_payments
  for delete to authenticated
  using ((select auth.uid()) = user_id);
