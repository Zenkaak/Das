begin;

create table if not exists public.das_vpn_plans (
  code text primary key,
  label text not null,
  amount_kes integer not null check (amount_kes > 0),
  duration_days integer not null check (duration_days in (3, 7, 30, 90, 365)),
  created_at timestamptz not null default now()
);

insert into public.das_vpn_plans (code, label, amount_kes, duration_days)
values
  ('three_days', '3 Days', 80, 3),
  ('weekly', 'Weekly', 120, 7),
  ('monthly', 'Monthly', 350, 30),
  ('three_months', '3 Months', 999, 90),
  ('yearly', 'Yearly', 2300, 365)
on conflict (code) do update
set label = excluded.label,
    amount_kes = excluded.amount_kes,
    duration_days = excluded.duration_days;

create table if not exists public.das_vpn_device_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  recovery_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.das_vpn_subscriptions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.das_vpn_device_sessions(id) on delete restrict,
  plan_code text not null references public.das_vpn_plans(code),
  payment_id uuid not null unique,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index if not exists das_vpn_subscriptions_session_expiry_idx
  on public.das_vpn_subscriptions (session_id, expires_at desc);

create table if not exists public.das_vpn_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.das_vpn_device_sessions(id) on delete restrict,
  plan_code text not null references public.das_vpn_plans(code),
  amount_kes integer not null check (amount_kes > 0),
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired')),
  merchant_request_id text unique,
  checkout_request_id text unique,
  mpesa_receipt text unique,
  result_code integer,
  transaction_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);

create index if not exists das_vpn_payments_session_created_idx
  on public.das_vpn_payments (session_id, created_at desc);

create table if not exists public.das_vpn_servers (
  id uuid primary key default gen_random_uuid(),
  server_key text not null unique,
  name text not null,
  country_code char(2) not null,
  country text not null,
  city text not null,
  endpoint_host text not null,
  endpoint_port integer not null check (endpoint_port between 1 and 65535),
  public_key text not null,
  controller_id text,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.das_vpn_peers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.das_vpn_device_sessions(id) on delete restrict,
  server_id uuid not null references public.das_vpn_servers(id) on delete restrict,
  public_key text not null,
  peer_address cidr,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (server_id, public_key)
);

create index if not exists das_vpn_peers_session_status_idx
  on public.das_vpn_peers (session_id, status, expires_at);

create table if not exists public.das_vpn_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  primary key (bucket_key, window_start)
);

create index if not exists das_vpn_rate_limits_window_idx
  on public.das_vpn_rate_limits (window_start);

create or replace function public.das_vpn_activate_verified_payment(
  p_payment_id uuid,
  p_mpesa_receipt text,
  p_transaction_date timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.das_vpn_payments%rowtype;
  v_plan public.das_vpn_plans%rowtype;
  v_session public.das_vpn_device_sessions%rowtype;
  v_expiry timestamptz;
  v_start timestamptz;
begin
  select * into v_payment
  from public.das_vpn_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status = 'paid' then
    select max(expires_at) into v_expiry
    from public.das_vpn_subscriptions
    where payment_id = p_payment_id;
    return jsonb_build_object('alreadyProcessed', true, 'expiresAt', v_expiry);
  end if;

  if v_payment.status <> 'pending'
     or v_payment.checkout_request_id is null
     or v_payment.amount_kes <= 0
     or p_mpesa_receipt is null
     or length(p_mpesa_receipt) < 8 then
    raise exception 'payment_not_eligible';
  end if;

  select * into v_session
  from public.das_vpn_device_sessions
  where id = v_payment.session_id and revoked_at is null
  for update;
  if not found then
    raise exception 'device_session_revoked';
  end if;

  select * into v_plan
  from public.das_vpn_plans
  where code = v_payment.plan_code and amount_kes = v_payment.amount_kes;
  if not found then
    raise exception 'plan_amount_mismatch';
  end if;

  select max(expires_at) into v_expiry
  from public.das_vpn_subscriptions
  where session_id = v_payment.session_id;

  v_start := greatest(coalesce(v_expiry, now()), now());
  v_expiry := v_start + make_interval(days => v_plan.duration_days);

  update public.das_vpn_payments
  set status = 'paid',
      mpesa_receipt = p_mpesa_receipt,
      transaction_date = p_transaction_date,
      updated_at = now()
  where id = p_payment_id;

  insert into public.das_vpn_subscriptions
    (session_id, plan_code, payment_id, starts_at, expires_at)
  values
    (v_payment.session_id, v_plan.code, p_payment_id, v_start, v_expiry);

  return jsonb_build_object(
    'alreadyProcessed', false,
    'startsAt', v_start,
    'expiresAt', v_expiry
  );
end;
$$;

create or replace function public.das_vpn_register_session(
  p_token_hash text,
  p_recovery_hash text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.das_vpn_device_sessions (token_hash, recovery_hash)
  values (p_token_hash, p_recovery_hash)
  on conflict (token_hash) do update
    set last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.das_vpn_recover_session(
  p_recovery_hash text,
  p_token_hash text,
  p_next_recovery_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.das_vpn_device_sessions
  where recovery_hash = p_recovery_hash and revoked_at is null
  for update;

  if not found then
    return false;
  end if;

  update public.das_vpn_device_sessions
  set token_hash = p_token_hash,
      recovery_hash = p_next_recovery_hash,
      last_seen_at = now()
  where id = v_id;
  return true;
end;
$$;

create or replace function public.das_vpn_allow_request(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.das_vpn_rate_limits(bucket_key, window_start, request_count)
  values (p_bucket_key, v_window, 1)
  on conflict (bucket_key, window_start)
  do update set request_count = public.das_vpn_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

alter table public.das_vpn_plans enable row level security;
alter table public.das_vpn_device_sessions enable row level security;
alter table public.das_vpn_subscriptions enable row level security;
alter table public.das_vpn_payments enable row level security;
alter table public.das_vpn_servers enable row level security;
alter table public.das_vpn_peers enable row level security;
alter table public.das_vpn_rate_limits enable row level security;

revoke all on public.das_vpn_plans, public.das_vpn_device_sessions,
  public.das_vpn_subscriptions, public.das_vpn_payments,
  public.das_vpn_servers, public.das_vpn_peers,
  public.das_vpn_rate_limits from anon, authenticated;

grant all on public.das_vpn_plans, public.das_vpn_device_sessions,
  public.das_vpn_subscriptions, public.das_vpn_payments,
  public.das_vpn_servers, public.das_vpn_peers,
  public.das_vpn_rate_limits to service_role;

revoke all on function public.das_vpn_activate_verified_payment(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.das_vpn_register_session(text, text) from public, anon, authenticated;
revoke all on function public.das_vpn_recover_session(text, text, text) from public, anon, authenticated;
revoke all on function public.das_vpn_allow_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.das_vpn_activate_verified_payment(uuid, text, timestamptz) to service_role;
grant execute on function public.das_vpn_register_session(text, text) to service_role;
grant execute on function public.das_vpn_recover_session(text, text, text) to service_role;
grant execute on function public.das_vpn_allow_request(text, integer, integer) to service_role;

commit;
