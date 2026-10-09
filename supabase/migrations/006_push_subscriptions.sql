-- Phones that get payment reminders: one row per phone that turned on Profile → Notifications.
-- The daily reminder job (api/remind.js on Vercel) reads these with the server-only key.
-- Run once in Supabase Dashboard → SQL Editor.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Where Apple's push service accepts notifications for this phone, and its encryption keys
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- Same access rules as every other table: only your own rows, only when logged in
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

create policy "own rows: select" on public.push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "own rows: insert" on public.push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own rows: update" on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own rows: delete" on public.push_subscriptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);
