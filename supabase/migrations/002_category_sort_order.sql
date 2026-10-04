-- Lets the owner choose the order categories appear in.
-- Run once in Supabase Dashboard → SQL Editor.

alter table public.categories
  add column sort_order integer not null default 0;

-- Keep the current order (creation order) as the starting point
update public.categories c
set sort_order = ranked.position
from (
  select id, row_number() over (partition by user_id, kind order by created_at, name) as position
  from public.categories
) as ranked
where ranked.id = c.id;
