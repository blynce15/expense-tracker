-- One row per user: settings that follow you across devices, plus onboarding.
-- Run once in Supabase Dashboard → SQL Editor.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Day of the month the budget period starts (the owner's payday). Shorter months use their last day.
  budget_start_day smallint not null default 1 check (budget_start_day between 1 and 31),
  -- Answers to the "About you" questions, e.g. {"goal": "Save more", "saving": ["Travel"]}
  answers jsonb not null default '{}'::jsonb,
  -- Set when the setup flow is finished; empty means it hasn't been done
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Same access rules as every other table: only your own row, only when logged in
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "own row: select" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "own row: insert" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own row: update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
