-- Pension: money the company (employer) put in, apart from your own.
-- put_in_cents = your money added since the previous entry; company_put_in_cents = the company's.
-- The first entry holds everything put in before LynxOS (yours and the company's). Existing rows: €0 from the company.

alter table public.pension_entries
  add column company_put_in_cents bigint not null default 0
  check (company_put_in_cents >= 0 and company_put_in_cents <= 999999999);
