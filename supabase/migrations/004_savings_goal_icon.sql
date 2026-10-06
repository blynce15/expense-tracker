-- An emoji for each savings goal (optional; the app shows 🐷 when empty).
-- Run once in Supabase Dashboard → SQL Editor.

alter table public.savings_goals add column icon text;
