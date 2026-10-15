begin;

alter table public.das_vpn_plans
  add column if not exists badge text;

alter table public.das_vpn_plans
  drop constraint if exists das_vpn_plans_duration_days_check;

alter table public.das_vpn_plans
  add constraint das_vpn_plans_duration_days_check
  check (duration_days in (1, 3, 7, 14, 30, 60, 90, 180, 270, 365));

alter table public.das_vpn_payments
  add column if not exists phone_number text,
  add column if not exists result_description text;

create unique index if not exists das_vpn_payments_one_pending_per_session_idx
  on public.das_vpn_payments (session_id)
  where status = 'pending';

insert into public.das_vpn_plans (code, label, amount_kes, duration_days, badge)
values
  ('one_day', '1 Day', 80, 1, null),
  ('three_days', '3 Days', 150, 3, null),
  ('weekly', '7 Days', 250, 7, null),
  ('fourteen_days', '14 Days', 400, 14, null),
  ('monthly', '30 Days', 600, 30, 'MOST POPULAR'),
  ('two_months', '2 Months', 1100, 60, null),
  ('three_months', '3 Months', 1500, 90, null),
  ('six_months', '6 Months', 2500, 180, null),
  ('nine_months', '9 Months', 3300, 270, null),
  ('yearly', '12 Months', 4000, 365, 'BEST VALUE')
on conflict (code) do update
set label = excluded.label,
    amount_kes = excluded.amount_kes,
    duration_days = excluded.duration_days,
    badge = excluded.badge;

commit;
