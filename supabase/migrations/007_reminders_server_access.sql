-- Lets the daily reminder job (api/remind.js on Vercel, using the server-only secret key)
-- read what it needs. The app itself is unaffected: it still only sees your own rows.
-- Run once in Supabase Dashboard → SQL Editor.

grant select, delete on public.push_subscriptions to service_role;
grant select on public.recurring_payments to service_role;
