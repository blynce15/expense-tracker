-- Lets the daily reminder job show which card a payment comes from ("€12,99 · Main card · Sat 10 Oct").
-- The app itself is unaffected: it still only sees your own rows.
-- Run once in Supabase Dashboard → SQL Editor.

grant select on public.accounts to service_role;
