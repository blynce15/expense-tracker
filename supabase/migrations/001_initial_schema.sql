-- Expense Tracker — initial schema
-- Run once in Supabase Dashboard → SQL Editor.
-- Money is stored as integer cents. Every row belongs to one user (user_id),
-- and Row Level Security ensures a user can only touch their own rows.

-- ───────────────────────────── accounts ─────────────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('debit', 'credit', 'cash', 'savings')),
  starting_balance_cents bigint not null default 0,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  -- lets transactions reference (id, user_id) so they can't point at another user's account
  unique (id, user_id)
);
create index accounts_user_id_idx on public.accounts (user_id);

-- ──────────────────────────── categories ────────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text,
  color text,
  kind text not null check (kind in ('expense', 'income')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- also makes seeding default categories safe to repeat
  unique (user_id, kind, name)
);

-- ─────────────────────────── transactions ───────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount_cents bigint not null check (amount_cents > 0),
  date date not null default current_date,
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  note text,
  created_at timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,

  -- transfers: need a different destination account and no category
  -- expense/income: no destination account
  constraint transfer_shape check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null)
  )
);
create index transactions_user_date_idx on public.transactions (user_id, date desc, created_at desc);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_to_account_id_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_category_id_idx on public.transactions (category_id) where category_id is not null;

-- ─────────────────────────── savings_goals ──────────────────────────
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  deadline date,
  created_at timestamptz not null default now()
);
create index savings_goals_user_id_idx on public.savings_goals (user_id);

-- ───────────────────── access: grants + Row Level Security ─────────────────────
-- Logged-out visitors (anon) get nothing. Logged-in users get access,
-- but RLS limits them to rows where user_id = their own id.
revoke all on public.accounts, public.categories, public.transactions, public.savings_goals from anon;
grant select, insert, update, delete
  on public.accounts, public.categories, public.transactions, public.savings_goals
  to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'savings_goals'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format($p$create policy "own rows: select" on public.%I
      for select to authenticated
      using ((select auth.uid()) = user_id)$p$, t);

    execute format($p$create policy "own rows: insert" on public.%I
      for insert to authenticated
      with check ((select auth.uid()) = user_id)$p$, t);

    execute format($p$create policy "own rows: update" on public.%I
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)$p$, t);

    execute format($p$create policy "own rows: delete" on public.%I
      for delete to authenticated
      using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end
$$;
